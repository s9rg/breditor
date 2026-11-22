//! Bounded real loopback HTTP/WebSocket clients, with no browser or OS UI state.
use super::fixture::{ORIGIN, TestResult};
use serde_json::{Value, json};
use std::{
    io::{self, Read, Write},
    net::{Shutdown, SocketAddr, TcpStream},
    time::Duration,
};
fn invalid(message: &str) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidData, message)
}
fn headers(stream: &mut TcpStream) -> io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    while !bytes.ends_with(b"\r\n\r\n") {
        let mut byte = [0];
        stream.read_exact(&mut byte)?;
        bytes.push(byte[0]);
        if bytes.len() > 16384 {
            return Err(invalid("HTTP header budget"));
        }
    }
    Ok(bytes)
}
fn socket(address: SocketAddr) -> io::Result<TcpStream> {
    let stream = TcpStream::connect_timeout(&address, Duration::from_secs(5))?;
    stream.set_read_timeout(Some(Duration::from_secs(5)))?;
    stream.set_write_timeout(Some(Duration::from_secs(5)))?;
    Ok(stream)
}
fn http_response(mut stream: TcpStream) -> io::Result<(u16, Vec<u8>)> {
    let head = headers(&mut stream)?;
    let text = std::str::from_utf8(&head).map_err(|_| invalid("HTTP UTF8"))?;
    let status = text
        .split_whitespace()
        .nth(1)
        .ok_or_else(|| invalid("HTTP status"))?
        .parse()
        .map_err(|_| invalid("HTTP status"))?;
    let length = text
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .ok_or_else(|| invalid("HTTP length"))?;
    if length > 1024 * 1024 {
        return Err(invalid("HTTP response budget"));
    }
    let mut bytes = vec![0; length];
    stream.read_exact(&mut bytes)?;
    Ok((status, bytes))
}
pub(in crate::server) struct Network {
    pub address: SocketAddr,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<io::Result<()>>>,
}
impl Network {
    pub async fn start(router: axum::Router) -> TestResult<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        io::stderr()
            .lock()
            .write_all(format!("BREDITOR_FENCE_LISTENER_OPEN {address}\n").as_bytes())?;
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let task = tokio::spawn(async move {
            axum::serve(listener, router)
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
        });
        Ok(Self { address, stop: Some(stop), task: Some(task) })
    }
    pub async fn http(
        &self,
        method: &str,
        path: &str,
        token: &str,
        bytes: &[u8],
    ) -> TestResult<(u16, Vec<u8>)> {
        let address = self.address;
        let head = format!(
            "{method} {path} HTTP/1.1\r\nHost: {address}\r\nOrigin: {ORIGIN}\r\nX-Breditor-Principal: owner\r\nAuthorization: Bearer {token}\r\nContent-Type: image/png\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            bytes.len()
        );
        let bytes = bytes.to_vec();
        Ok(tokio::task::spawn_blocking(move || {
            let mut stream = socket(address)?;
            stream.write_all(head.as_bytes())?;
            stream.write_all(&bytes)?;
            http_response(stream)
        })
        .await??)
    }
    pub async fn admitted_upload(
        &self,
        path: &str,
        token: &str,
        bytes: usize,
    ) -> TestResult<TcpStream> {
        let address = self.address;
        let head = format!(
            "PUT {path} HTTP/1.1\r\nHost: {address}\r\nOrigin: {ORIGIN}\r\nX-Breditor-Principal: owner\r\nAuthorization: Bearer {token}\r\nContent-Type: image/png\r\nContent-Length: {bytes}\r\nExpect: 100-continue\r\nConnection: close\r\n\r\n"
        );
        Ok(tokio::task::spawn_blocking(move || {
            let mut stream = socket(address)?;
            stream.write_all(head.as_bytes())?;
            if headers(&mut stream)? != b"HTTP/1.1 100 Continue\r\n\r\n" {
                return Err(invalid("asset body was not actually admitted"));
            }
            Ok(stream)
        })
        .await??)
    }
    pub async fn finish_upload(mut stream: TcpStream, bytes: &[u8]) -> TestResult<(u16, Vec<u8>)> {
        let bytes = bytes.to_vec();
        Ok(tokio::task::spawn_blocking(move || {
            stream.write_all(&bytes)?;
            http_response(stream)
        })
        .await??)
    }
    pub async fn stop(mut self) -> TestResult {
        let _ = self.stop.take().ok_or("listener stop missing")?.send(());
        tokio::time::timeout(
            Duration::from_secs(5),
            self.task.take().ok_or("listener task missing")?,
        )
        .await???;
        assert!(TcpStream::connect_timeout(&self.address, Duration::from_secs(1)).is_err());
        io::stderr()
            .lock()
            .write_all(format!("BREDITOR_FENCE_LISTENER_CLOSED {}\n", self.address).as_bytes())?;
        Ok(())
    }
}
impl Drop for Network {
    fn drop(&mut self) {
        if let Some(stop) = self.stop.take() {
            let _ = stop.send(());
        }
        if let Some(task) = self.task.take() {
            task.abort();
        }
    }
}
fn send_frame(stream: &mut TcpStream, opcode: u8, body: &[u8]) -> io::Result<()> {
    if body.len() > 6 * 1024 * 1024 {
        return Err(invalid("WebSocket payload budget"));
    }
    let mut frame = vec![0x80 | opcode];
    if body.len() < 126 {
        frame.push(0x80 | u8::try_from(body.len()).map_err(|_| invalid("frame length"))?);
    } else if body.len() <= 65535 {
        frame.push(0xfe);
        frame.extend_from_slice(
            &u16::try_from(body.len()).map_err(|_| invalid("frame length"))?.to_be_bytes(),
        );
    } else {
        frame.push(0xff);
        frame.extend_from_slice(
            &u64::try_from(body.len()).map_err(|_| invalid("frame length"))?.to_be_bytes(),
        );
    }
    let mut mask = [0; 4];
    getrandom::fill(&mut mask).map_err(|_| invalid("test mask entropy"))?;
    frame.extend_from_slice(&mask);
    frame.extend(body.iter().enumerate().map(|(i, byte)| byte ^ mask[i % 4]));
    stream.write_all(&frame)
}
fn receive(stream: &mut TcpStream) -> io::Result<Value> {
    loop {
        let mut first = [0; 2];
        stream.read_exact(&mut first)?;
        if first[0] & 0x80 == 0 || first[1] & 0x80 != 0 {
            return Err(invalid("unexpected server fragmentation/mask"));
        }
        let length = match first[1] & 0x7f {
            126 => {
                let mut bytes = [0; 2];
                stream.read_exact(&mut bytes)?;
                u64::from(u16::from_be_bytes(bytes))
            }
            127 => {
                let mut bytes = [0; 8];
                stream.read_exact(&mut bytes)?;
                u64::from_be_bytes(bytes)
            }
            value => u64::from(value),
        };
        if length > 6 * 1024 * 1024 {
            return Err(invalid("server frame budget"));
        }
        let mut body = vec![0; usize::try_from(length).map_err(|_| invalid("frame length"))?];
        stream.read_exact(&mut body)?;
        match first[0] & 0x0f {
            1 => return serde_json::from_slice(&body).map_err(|_| invalid("server JSON")),
            9 => send_frame(stream, 10, &body)?,
            10 => {}
            _ => return Err(invalid("server connection closed")),
        }
    }
}
pub(super) struct Socket {
    stream: Option<TcpStream>,
    sequence: u64,
}
impl Socket {
    pub async fn connect(address: SocketAddr) -> TestResult<Self> {
        let stream = tokio::task::spawn_blocking(move || {let mut stream = socket(address)?;stream.write_all(format!("GET /ws HTTP/1.1\r\nHost: {address}\r\nOrigin: {ORIGIN}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n").as_bytes())?;let head = headers(&mut stream)?;if !head.starts_with(b"HTTP/1.1 101 ") {return Err(invalid("WebSocket upgrade"));}Ok::<_, io::Error>(stream)}).await??;
        Ok(Self { stream: Some(stream), sequence: 0 })
    }
    pub async fn request(&mut self, request: Value) -> TestResult<Value> {
        self.sequence += 1;
        let id = self.sequence.to_string();
        let input = json!({"format":"breditor/relay","formatVersion":1,"id":id,"request":request})
            .to_string();
        let mut stream = self.stream.take().ok_or("closed test socket")?;
        let (stream, value) = tokio::task::spawn_blocking(move || {
            send_frame(&mut stream, 1, input.as_bytes())?;
            for _ in 0..32 {
                let reply = receive(&mut stream)?;
                if reply["id"] == id {
                    return Ok::<_, io::Error>((stream, reply["result"].clone()));
                }
            }
            Err(invalid("reply correlation budget"))
        })
        .await??;
        self.stream = Some(stream);
        Ok(value)
    }
    pub async fn notification(&mut self) -> TestResult<Value> {
        let mut stream = self.stream.take().ok_or("closed test socket")?;
        let (stream, reply) = tokio::task::spawn_blocking(move || {
            let reply = receive(&mut stream)?;
            Ok::<_, io::Error>((stream, reply))
        })
        .await??;
        self.stream = Some(stream);
        if reply.get("id") != Some(&Value::Null) {
            return Err(invalid("expected unsolicited relay notification").into());
        }
        Ok(reply["result"].clone())
    }
}
impl Drop for Socket {
    fn drop(&mut self) {
        if let Some(stream) = self.stream.take() {
            let _ = stream.shutdown(Shutdown::Both);
        }
    }
}
