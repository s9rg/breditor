//! Bounded original-protocol WebSocket over a real loopback publication socket.
use super::{operator_network::ORIGIN, source::TestResult};
use serde_json::{Value, json};
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpStream},
    time::Duration,
};

pub(super) struct Socket(TcpStream);
impl Socket {
    pub async fn open(address: SocketAddr) -> TestResult<Self> {
        Ok(tokio::task::spawn_blocking(move || -> std::result::Result<Self, String> {
            (|| -> TestResult<Self> {
            let mut stream = TcpStream::connect_timeout(&address, Duration::from_secs(10))?;
            stream.set_read_timeout(Some(Duration::from_secs(10)))?;
            stream.set_write_timeout(Some(Duration::from_secs(10)))?;
            write!(stream, "GET /ws HTTP/1.1\r\nHost: {address}\r\nOrigin: {ORIGIN}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n")?;
            let mut response = Vec::new();
            while !response.ends_with(b"\r\n\r\n") {
                let mut byte = [0];
                stream.read_exact(&mut byte)?;
                response.push(byte[0]);
                if response.len() > 4096 { return Err("upgrade response budget".into()); }
            }
            assert!(std::str::from_utf8(&response)?.starts_with("HTTP/1.1 101 "));
            Ok(Self(stream))
            })().map_err(|error| error.to_string())
        }).await??)
    }
    pub async fn request(self, id: &str, request: Value) -> TestResult<(Self, Value)> {
        let id = id.to_owned();
        let bytes = serde_json::to_vec(
            &json!({"format":"breditor/relay","formatVersion":1,"id":id,"request":request}),
        )?;
        Ok(tokio::task::spawn_blocking(move || -> std::result::Result<(Self, Value), String> {
            let mut this = self;
            this.send(&bytes).map_err(|error| error.to_string())?;
            for _ in 0..64 {
                let frame = this.read().map_err(|error| error.to_string())?;
                let envelope: Value =
                    serde_json::from_slice(&frame).map_err(|error| error.to_string())?;
                if envelope["id"].as_str() == Some(id.as_str()) {
                    return Ok((this, envelope["result"].clone()));
                }
            }
            Err("bounded reply observation exhausted".into())
        })
        .await??)
    }
    fn send(&mut self, bytes: &[u8]) -> std::io::Result<()> {
        self.0.write_all(&[0x81])?;
        match u16::try_from(bytes.len()) {
            Ok(n) if n < 126 => {
                self.0.write_all(&[0x80 | u8::try_from(n).expect("small frame")])?;
            }
            Ok(n) => {
                self.0.write_all(&[0x80 | 0x7e])?;
                self.0.write_all(&n.to_be_bytes())?;
            }
            Err(_) => {
                self.0.write_all(&[0x80 | 127])?;
                self.0.write_all(&u64::try_from(bytes.len()).expect("frame size").to_be_bytes())?;
            }
        }
        let mask = [1_u8, 2, 3, 4];
        self.0.write_all(&mask)?;
        self.0
            .write_all(&bytes.iter().enumerate().map(|(i, b)| b ^ mask[i % 4]).collect::<Vec<_>>())
    }
    fn read(&mut self) -> std::io::Result<Vec<u8>> {
        let mut prefix = [0; 2];
        self.0.read_exact(&mut prefix)?;
        if prefix[0] & 0xf != 1 || prefix[1] & 0x80 != 0 {
            return Err(std::io::Error::other("expected unmasked server text"));
        }
        let count = match prefix[1] {
            126 => {
                let mut bytes = [0; 2];
                self.0.read_exact(&mut bytes)?;
                usize::from(u16::from_be_bytes(bytes))
            }
            127 => {
                let mut bytes = [0; 8];
                self.0.read_exact(&mut bytes)?;
                usize::try_from(u64::from_be_bytes(bytes)).map_err(std::io::Error::other)?
            }
            count => usize::from(count),
        };
        if count > 6 * 1024 * 1024 {
            return Err(std::io::Error::other("server frame budget"));
        }
        let mut body = vec![0; count];
        self.0.read_exact(&mut body)?;
        Ok(body)
    }
}
