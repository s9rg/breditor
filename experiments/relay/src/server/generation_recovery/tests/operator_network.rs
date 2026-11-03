//! Exclusively owned loopback listener and bounded raw HTTP; no browser/OS state is touched.
use super::source::TestResult;
pub(super) const ORIGIN: &str = "http://127.0.0.1:4187";
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};

fn complete(bytes: &[u8]) -> Option<usize> {
    let split = bytes.windows(4).position(|part| part == b"\r\n\r\n")?;
    let headers = std::str::from_utf8(&bytes[..split]).ok()?;
    let length = headers
        .lines()
        .find_map(|line| {
            let (name, value) = line.split_once(':')?;
            name.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .or_else(|| headers.starts_with("HTTP/1.1 204 ").then_some(0))?;
    let end = split.checked_add(4)?.checked_add(length)?;
    (bytes.len() >= end).then_some(end)
}
fn response_bytes(stream: &mut TcpStream) -> std::io::Result<Vec<u8>> {
    let mut response = Vec::new();
    let mut chunk = [0_u8; 4096];
    loop {
        let count = stream.read(&mut chunk)?;
        if count == 0 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::UnexpectedEof,
                "incomplete HTTP test response",
            ));
        }
        response.extend_from_slice(&chunk[..count]);
        if let Some(end) = complete(&response) {
            response.truncate(end);
            return Ok(response);
        }
        if response.len() > 512 * 1024 {
            return Err(std::io::Error::new(
                std::io::ErrorKind::InvalidData,
                "HTTP test response budget",
            ));
        }
    }
}
fn decode_response(bytes: &[u8]) -> TestResult<Response> {
    let split = bytes.windows(4).position(|part| part == b"\r\n\r\n").ok_or("HTTP head")?;
    let headers = std::str::from_utf8(&bytes[..split])?.to_owned();
    let status = headers.split_whitespace().nth(1).ok_or("HTTP status")?.parse()?;
    Ok(Response { status, headers, body: bytes[split + 4..].to_vec() })
}

pub(super) struct Response {
    pub status: u16,
    pub headers: String,
    pub body: Vec<u8>,
}
#[derive(Clone, Copy)]
pub(super) struct Request<'a> {
    pub method: &'a str,
    pub path: &'a str,
    pub principal: &'a str,
    pub token: &'a str,
    pub origin: &'a str,
    pub extra: &'a str,
}
impl<'a> Request<'a> {
    pub fn check(token: &'a str) -> Self {
        Self {
            method: "POST",
            path: "/recovery/generation-delivery/v1/check",
            principal: "operator",
            token,
            origin: ORIGIN,
            extra: "",
        }
    }
    fn head(&self, address: SocketAddr, bytes: usize) -> String {
        format!(
            "{} {} HTTP/1.1\r\nHost: {address}\r\nOrigin: {}\r\nX-Breditor-Principal: {}\r\nAuthorization: Bearer {}\r\nContent-Type: application/json\r\nContent-Length: {bytes}\r\nConnection: close\r\n{}\r\n",
            self.method, self.path, self.origin, self.principal, self.token, self.extra
        )
    }
}
pub(super) struct Network {
    pub address: SocketAddr,
    stop: Option<tokio::sync::oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<std::io::Result<()>>>,
}
impl Network {
    pub async fn start(router: axum::Router) -> TestResult<Self> {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
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
    pub async fn request(&self, request: &Request<'_>, body: &[u8]) -> TestResult<Response> {
        Self::request_at(self.address, request, body).await
    }
    pub async fn request_at(
        address: SocketAddr,
        request: &Request<'_>,
        body: &[u8],
    ) -> TestResult<Response> {
        let head = request.head(address, body.len());
        let bytes = body.to_vec();
        let bytes = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(10))?;
            stream.set_read_timeout(Some(Duration::from_secs(10)))?;
            stream.set_write_timeout(Some(Duration::from_secs(10)))?;
            stream.write_all(head.as_bytes())?;
            stream.write_all(&bytes)?;
            response_bytes(&mut stream)
        })
        .await??;
        decode_response(&bytes)
    }
    pub async fn unfinished(&self, token: &str) -> TestResult<TcpStream> {
        self.unfinished_request(&Request::check(token)).await
    }
    pub async fn unfinished_request(&self, request: &Request<'_>) -> TestResult<TcpStream> {
        // Hyper's EXPECT channel sends Continue only after the handler polls the body.
        // Authentication and this controller's permit acquisition therefore precede this
        // actual wire witness. No scheduling guesses, sleeps or private state hook is used.
        let extra = format!("{}Expect: 100-continue\r\n", request.extra);
        let head = Request { extra: &extra, ..*request }.head(self.address, 1);
        let address = self.address;
        Ok(tokio::task::spawn_blocking(move || -> std::io::Result<TcpStream> {
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(10))?;
            stream.set_read_timeout(Some(Duration::from_secs(10)))?;
            stream.set_write_timeout(Some(Duration::from_secs(10)))?;
            stream.write_all(head.as_bytes())?;
            let expected = b"HTTP/1.1 100 Continue\r\n\r\n";
            let mut actual = [0_u8; 25];
            stream.read_exact(&mut actual)?;
            if actual != *expected {
                return Err(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "HTTP body was not actually admitted",
                ));
            }
            Ok(stream)
        })
        .await??)
    }
    pub async fn finish_unfinished(mut stream: TcpStream) -> TestResult<Response> {
        let bytes = tokio::task::spawn_blocking(move || -> std::io::Result<Vec<u8>> {
            stream.write_all(b"?")?;
            response_bytes(&mut stream)
        })
        .await??;
        decode_response(&bytes)
    }
    pub async fn stop(mut self) -> TestResult {
        self.stop.take().ok_or("server stop")?.send(()).map_err(|()| "server stopped")?;
        self.task.take().ok_or("server task")?.await??;
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
