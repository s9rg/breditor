//! Opt-in document server: authenticated REST reads, room creation/archival, server-side content
//! injection converging with a real connected WebSocket replica, stale refusal and signed webhooks
//! delivered to a local receiver with retries.
#![cfg(feature = "server")]
// End-to-end scenarios read best as one flow per contract.
#![allow(
    clippy::too_many_lines,
    clippy::similar_names,
    clippy::type_complexity,
    clippy::case_sensitive_file_extension_comparisons
)]
use breditor_collab_feasibility::{
    anchor::Affinity,
    review::{
        ReviewAccess, ReviewActorId, ReviewActorPolicy, ReviewOutcome, ReviewPrincipalId,
        ReviewThreadId,
        actions::{CreateReviewThread, ReviewAction, SetReviewThreadState},
    },
    rich_replica::{
        Command, ReviewAnchorTarget, RichReplica, SharedRichProfile,
        actions::{InsertBlocks, InsertText, RangeTextRun, ReplaceTextRange, SetHeading},
        selection::TextPoint,
    },
};
use breditor_collab_relay::{
    ReviewAdmission, Role,
    server::{
        Authentication, DocumentServer, DocumentServerConfiguration, WEBHOOK_SIGNATURE_HEADER,
        verify_webhook_signature,
    },
};
use futures_util::{SinkExt, StreamExt};
use serde_json::{Value, json};
use std::{
    fs,
    net::SocketAddr,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use tokio_tungstenite::tungstenite::{Message, client::IntoClientRequest};
type Result<T = ()> = std::result::Result<T, Box<dyn std::error::Error + Send + Sync>>;

const ORIGIN: &str = "http://127.0.0.1:49810";
const SECRET: &str = "webhook-secret-0123456789abcdef-0123";

struct Directory(PathBuf);
impl Directory {
    fn new() -> Result<Self> {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let nonce = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_nanos();
        let path = std::env::temp_dir().join(format!(
            "breditor-document-server-{}-{nonce}-{}",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path)?;
        Ok(Self(path))
    }
}
impl Drop for Directory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

struct Accounts {
    tokens: Vec<(String, String)>,
    json: String,
}
impl Accounts {
    fn new() -> Result<Self> {
        let mut tokens = Vec::new();
        let mut accounts = Vec::new();
        for principal in ["alice", "bob", "mallory", "admin"] {
            let (token, hash) = Authentication::issue_token()?;
            accounts.push(json!({"principal":principal,"tokenHash":hash}));
            tokens.push((principal.to_owned(), token));
        }
        let json = json!({"format":"breditor/relay-auth","formatVersion":1,"accounts":accounts,
            "origins":[ORIGIN]})
        .to_string();
        Ok(Self { tokens, json })
    }
    fn token(&self, principal: &str) -> &str {
        &self.tokens.iter().find(|(p, _)| p == principal).expect("test account").1
    }
}
fn api_config(webhooks: &Value) -> Value {
    json!({"format":"breditor/relay-document-api","formatVersion":1,
        "servicePrincipal":"service:documents",
        "creators":["alice"],"administrators":["admin"],
        "injection":{"enabled":true,"injectors":["alice","bob"]},
        "limits":{"maxRooms":4,"maxRequestBytes":65536,"maxCommands":4},
        "webhooks":webhooks})
}
async fn serve(
    directory: &Directory,
    accounts: &Accounts,
    config: &Value,
) -> Result<(DocumentServer, SocketAddr)> {
    let server = DocumentServer::open(
        &directory.0,
        Authentication::from_json(&accounts.json)?,
        DocumentServerConfiguration::from_json(&config.to_string())?,
    )?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let router = server.router();
    tokio::spawn(async move {
        let _ = axum::serve(listener, router).await;
    });
    Ok((server, address))
}

struct Client<'a> {
    address: SocketAddr,
    accounts: &'a Accounts,
}
impl Client<'_> {
    async fn raw(
        &self,
        method: &str,
        path: &str,
        principal: Option<&str>,
        extra: &str,
        body: &[u8],
    ) -> Result<(u16, Value)> {
        let mut stream = TcpStream::connect(self.address).await?;
        let auth = principal.map_or(String::new(), |p| {
            format!(
                "authorization: Bearer {}\r\nx-breditor-principal: {p}\r\n",
                self.accounts.token(p)
            )
        });
        let head = format!(
            "{method} {path} HTTP/1.1\r\nhost: 127.0.0.1\r\nconnection: close\r\n{auth}{extra}content-type: application/json\r\ncontent-length: {}\r\n\r\n",
            body.len()
        );
        stream.write_all(head.as_bytes()).await?;
        stream.write_all(body).await?;
        let mut response = Vec::new();
        stream.read_to_end(&mut response).await?;
        let text = String::from_utf8_lossy(&response);
        let status = text.split_whitespace().nth(1).ok_or("status")?.parse()?;
        let body = text.split_once("\r\n\r\n").map_or("", |(_, b)| b);
        Ok((status, serde_json::from_str(body).unwrap_or(Value::Null)))
    }
    async fn call(
        &self,
        method: &str,
        path: &str,
        principal: &str,
        body: &Value,
    ) -> Result<(u16, Value)> {
        let bytes = if body.is_null() { Vec::new() } else { serde_json::to_vec(body)? };
        self.raw(method, path, Some(principal), "", &bytes).await
    }
}

fn configuration() -> String {
    json!({"format":"breditor/shared-rich-profile","formatVersion":4,"schema":{"name":"example/document-api","version":4},"extensions":[]}).to_string()
}
fn el(kind: &str, id: &str, text: &str) -> Value {
    json!({"kind":"element","type":format!("breditor/{kind}"),"entityId":null,
        "properties":{"breditor/block-id":id},"children":[{"kind":"text","text":text,"formats":[]}]})
}
fn root() -> Value {
    let mut heading = el("heading", "title", "Draft");
    heading["properties"]["breditor/level"] = json!(1);
    json!({"kind":"element","type":"breditor/document","entityId":null,
        "properties":{"breditor/document-id":"notes"},
        "children":[heading, el("paragraph","body","Hello world")]})
}
fn profile() -> Result<SharedRichProfile> {
    Ok(SharedRichProfile::from_configuration_json_v4(&configuration())?)
}
fn document(profile: &SharedRichProfile) -> Value {
    json!({"format":"breditor/document","formatVersion":2,"schema":{"name":"example/document-api","version":4},
        "schemaFingerprint":profile.schema().fingerprint().to_string(),"root":root()})
}
fn create_body(name: &str, service_access: bool) -> Result<Value> {
    Ok(
        json!({"room":name,"languageVersion":4,"configuration":serde_json::from_str::<Value>(&configuration())?,
        "document":document(&profile()?),"serviceAccess":service_access}),
    )
}
fn point(block: &str, offset: u32) -> TextPoint {
    TextPoint { block: block.into(), offset, affinity: Affinity::After }
}
fn injection(base: &Value) -> Result<Value> {
    let commands = vec![
        Command::InsertBlocks(InsertBlocks {
            parent: None,
            before: None,
            nodes: vec![el("paragraph", "summary", "Injected summary")],
        }),
        Command::ReplaceTextRange(ReplaceTextRange {
            anchor: point("title", 0),
            focus: point("title", 5),
            runs: vec![RangeTextRun { text: "Final".into(), formats: vec![] }],
        }),
        Command::SetHeading(SetHeading { block: "summary".into(), level: Some(2) }),
    ];
    Ok(json!({"baseRevision":base,"commands":serde_json::to_value(commands)?}))
}

type Socket = tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<TcpStream>>;
async fn request(socket: &mut Socket, id: &str, request: Value) -> Result<Value> {
    socket
        .send(Message::Text(
            json!({"format":"breditor/relay","formatVersion":1,"id":id,"request":request})
                .to_string()
                .into(),
        ))
        .await?;
    loop {
        let reply = next(socket).await?;
        if reply["id"] == json!(id) {
            return Ok(reply);
        }
    }
}
async fn next(socket: &mut Socket) -> Result<Value> {
    loop {
        let message = tokio::time::timeout(Duration::from_secs(10), socket.next())
            .await?
            .ok_or("socket closed")??;
        if let Message::Text(text) = message {
            return Ok(serde_json::from_str(&text)?);
        }
    }
}
fn payload(reply: &Value) -> &Value {
    &reply["result"]
}
async fn connect(address: SocketAddr, room: &str, accounts: &Accounts) -> Result<(Socket, Value)> {
    let mut request = format!("ws://{address}/rooms/{room}/ws").into_client_request()?;
    request.headers_mut().insert("origin", ORIGIN.parse()?);
    let (mut socket, _) = tokio_tungstenite::connect_async(request).await?;
    let reply = self::request(
        &mut socket,
        "auth",
        json!({"kind":"authenticate","principal":"alice","token":accounts.token("alice"),"capabilities":[]}),
    )
    .await?;
    Ok((socket, reply))
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn api_refuses_unauthenticated_unauthorized_and_unbounded_requests() -> Result {
    let directory = Directory::new()?;
    let accounts = Accounts::new()?;
    let (server, address) = serve(&directory, &accounts, &api_config(&json!({}))).await?;
    let client = Client { address, accounts: &accounts };
    assert_eq!(client.raw("GET", "/documents/v1/rooms", None, "", b"").await?.0, 403);
    let forged = "authorization: Bearer 00\r\nx-breditor-principal: alice\r\n";
    assert_eq!(client.raw("GET", "/documents/v1/rooms", None, forged, b"").await?.0, 403);
    let origin = "origin: http://evil.test\r\n";
    assert_eq!(client.raw("GET", "/documents/v1/rooms", Some("alice"), origin, b"").await?.0, 403);
    // Only configured creators can create; the creator becomes the immutable owner.
    let (status, _) = client
        .call("POST", "/documents/v1/rooms", "mallory", &create_body("notes", false)?)
        .await?;
    assert_eq!(status, 403);
    assert_eq!(
        client
            .call("POST", "/documents/v1/rooms", "alice", &create_body("Bad/Name", false)?)
            .await?
            .0,
        400
    );
    let (status, created) =
        client.call("POST", "/documents/v1/rooms", "alice", &create_body("notes", false)?).await?;
    assert_eq!((status, created["kind"].as_str()), (201, Some("created")));
    assert_eq!(
        client.call("POST", "/documents/v1/rooms", "alice", &create_body("notes", false)?).await?.0,
        409
    );
    // Authentication grants no room role.
    assert_eq!(client.call("GET", "/documents/v1/rooms/notes", "bob", &Value::Null).await?.0, 403);
    assert_eq!(
        client.call("GET", "/documents/v1/rooms", "bob", &Value::Null).await?.1["rooms"],
        json!([])
    );
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/missing", "alice", &Value::Null).await?.0,
        404
    );
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/notes?format=html", "alice", &Value::Null).await?.0,
        406
    );
    server.with_room("notes", |room| room.grant("alice", "bob", Some(Role::Reader))).await?;
    let listed = client.call("GET", "/documents/v1/rooms", "bob", &Value::Null).await?.1;
    assert_eq!(listed["rooms"], json!([{"room":"notes","role":"reader"}]));
    let (status, snapshot) =
        client.call("GET", "/documents/v1/rooms/notes", "bob", &Value::Null).await?;
    assert_eq!(status, 200);
    let base = snapshot["revision"].clone();
    // A Reader cannot inject even if listed as an injector; an Editor cannot without service access.
    assert_eq!(
        client
            .call("POST", "/documents/v1/rooms/notes/injections", "bob", &injection(&base)?)
            .await?
            .0,
        403
    );
    assert_eq!(
        client
            .call("POST", "/documents/v1/rooms/notes/injections", "alice", &injection(&base)?)
            .await?
            .0,
        403
    );
    // Only the owner administers service access.
    assert_eq!(
        client
            .call("PUT", "/documents/v1/rooms/notes/service-access", "bob", &json!({"editor":true}))
            .await?
            .0,
        403
    );
    // Bounded body, command count and an explicit injectable-command allowlist.
    let huge = vec![b' '; 70_000];
    assert_eq!(
        client
            .raw("POST", "/documents/v1/rooms/notes/injections", Some("alice"), "", &huge)
            .await?
            .0,
        413
    );
    let mut many = injection(&base)?;
    let first = many["commands"][0].clone();
    many["commands"] = json!([first.clone(), first.clone(), first.clone(), first.clone(), first]);
    assert_eq!(
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &many).await?.1["code"],
        "command_budget"
    );
    let foreign =
        json!({"baseRevision":base,"commands":[{"kind":"change_document_layout_v1","data":{}}]});
    assert_eq!(
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &foreign).await?.1["code"],
        "command_not_injectable"
    );
    // Delivery logs are administrator-only; archival is owner-only.
    assert_eq!(
        client.call("GET", "/documents/v1/webhooks/deliveries", "alice", &Value::Null).await?.0,
        403
    );
    assert_eq!(
        client.call("GET", "/documents/v1/webhooks/deliveries", "admin", &Value::Null).await?.0,
        200
    );
    assert_eq!(
        client.call("DELETE", "/documents/v1/rooms/notes", "bob", &Value::Null).await?.0,
        403
    );
    // Nothing above appended document content: the revision is unchanged.
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["revision"],
        base
    );
    // The service principal can never be a login account.
    let mut colliding = api_config(&json!({}));
    colliding["servicePrincipal"] = json!("alice");
    assert!(
        DocumentServer::open(
            &directory.0,
            Authentication::from_json(&accounts.json)?,
            DocumentServerConfiguration::from_json(&colliding.to_string())?,
        )
        .is_err()
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn injection_is_one_native_group_converging_with_a_connected_replica_and_refuses_stale_revisions()
-> Result {
    let directory = Directory::new()?;
    let accounts = Accounts::new()?;
    let config = api_config(&json!({}));
    let (_server, address) = serve(&directory, &accounts, &config).await?;
    let client = Client { address, accounts: &accounts };
    assert_eq!(
        client.call("POST", "/documents/v1/rooms", "alice", &create_body("notes", true)?).await?.0,
        201
    );
    // Snapshot is the canonical admitted document of the room.
    let snapshot = client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1;
    assert_eq!(snapshot["document"]["root"], root());
    assert_eq!(snapshot["documentId"], "notes");
    let stale = snapshot["revision"].clone();

    // A real browser-protocol client: authenticate, register a writer, edit and submit.
    let (mut socket, authenticated) = connect(address, "notes", &accounts).await?;
    let profile = profile()?;
    let frame = payload(&authenticated)["frame"].as_str().ok_or("frame")?.to_owned();
    let registered = request(&mut socket, "register", json!({"kind":"register"})).await?;
    let writer = payload(&registered)["registration"]["lease"]["writer"]
        .as_str()
        .ok_or("writer")?
        .to_owned();
    let mut replica: RichReplica = profile.join_frame("notes".into(), writer, &frame)?;
    replica.apply(vec![Command::InsertText(InsertText {
        block: "body".into(),
        offset: 0,
        text: "Client: ".into(),
    })])?;
    let groups: Value =
        serde_json::from_str(&replica.writer_groups_guarded(&replica.observe()?, "0")?)?;
    let submitted =
        request(&mut socket, "submit", json!({"kind":"submit","group":groups["groups"][0]}))
            .await?;
    assert_eq!(payload(&submitted)["kind"], "durable");

    // The pre-edit revision is now stale: refused without touching the room.
    let (status, refused) = client
        .call("POST", "/documents/v1/rooms/notes/injections", "alice", &injection(&stale)?)
        .await?;
    assert_eq!((status, refused["code"].as_str()), (409, Some("stale_revision")));
    let current = refused["revision"].clone();
    assert_ne!(current, stale);

    let (status, injected) = client
        .call("POST", "/documents/v1/rooms/notes/injections", "alice", &injection(&current)?)
        .await?;
    assert_eq!((status, injected["kind"].as_str()), (200, Some("injected")), "{injected}");
    assert_eq!(injected["author"], "service:documents");
    let service_writer = injected["receipt"]["receipt"]["writer"].clone();
    assert_ne!(service_writer, json!(replica.writer()));
    // Retrying the same request is refused as stale; it cannot double-apply.
    assert_eq!(
        client
            .call("POST", "/documents/v1/rooms/notes/injections", "alice", &injection(&current)?)
            .await?
            .0,
        409
    );

    // The connected client receives the injection as an ordinary remote catchup.
    let mut converged = false;
    for _ in 0..8 {
        let message = next(&mut socket).await?;
        if let Some(frame) = payload(&message)["frame"].as_str() {
            replica.receive_frame(frame)?;
            if replica.causal_version() == injected["revision"].as_str().unwrap_or_default() {
                converged = true;
                break;
            }
        }
    }
    assert!(converged, "client did not receive the injection");
    let rest = client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1;
    assert_eq!(serde_json::from_str::<Value>(replica.document_json())?, rest["document"]);
    let children = &rest["document"]["root"]["children"];
    assert_eq!(children[0]["children"][0]["text"], "Final");
    assert_eq!(children[1]["children"][0]["text"], "Client: Hello world");
    assert_eq!(children[2]["type"], "breditor/heading");
    assert_eq!(children[2]["properties"]["breditor/level"], 2);
    // A remote server edit never enters the client's own Undo history.
    assert_eq!(replica.undo_count(), 1);
    drop(socket);

    // Restart: the service writer resumes from its 0600 state file instead of allocating anew.
    let state = directory.0.join("notes.service.json");
    #[cfg(unix)]
    assert_eq!(
        std::os::unix::fs::PermissionsExt::mode(&fs::metadata(&state)?.permissions()) & 0o777,
        0o600
    );
    Ok(())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn service_writer_survives_restart_and_revocation_stops_injection() -> Result {
    let directory = Directory::new()?;
    let accounts = Accounts::new()?;
    let config = api_config(&json!({}));
    let writer;
    {
        let server = DocumentServer::open(
            &directory.0,
            Authentication::from_json(&accounts.json)?,
            DocumentServerConfiguration::from_json(&config.to_string())?,
        )?;
        let listener = TcpListener::bind("127.0.0.1:0").await?;
        let address = listener.local_addr()?;
        let (stop, stopped) = tokio::sync::oneshot::channel::<()>();
        let served = tokio::spawn(
            axum::serve(listener, server.router())
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .into_future(),
        );
        let client = Client { address, accounts: &accounts };
        client.call("POST", "/documents/v1/rooms", "alice", &create_body("notes", true)?).await?;
        let base = client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1
            ["revision"]
            .clone();
        let injected = client
            .call("POST", "/documents/v1/rooms/notes/injections", "alice", &injection(&base)?)
            .await?
            .1;
        writer = injected["receipt"]["receipt"]["writer"].clone();
        let _ = stop.send(());
        served.await??;
        drop(server);
    }
    let (server, address) = serve(&directory, &accounts, &config).await?;
    assert_eq!(server.rooms(), ["notes"]);
    let client = Client { address, accounts: &accounts };
    let base =
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["revision"]
            .clone();
    let text = json!({"baseRevision":base,"commands":[serde_json::to_value(Command::InsertText(InsertText{block:"summary".into(),offset:0,text:"Updated ".into()}))?]});
    let (status, injected) =
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &text).await?;
    assert_eq!(status, 200, "{injected}");
    assert_eq!(injected["receipt"]["receipt"]["writer"], writer, "restart reused the same writer");
    // The owner revokes service access: injection is refused without touching content.
    let revision = injected["revision"].clone();
    assert_eq!(
        client
            .call(
                "PUT",
                "/documents/v1/rooms/notes/service-access",
                "alice",
                &json!({"editor":false})
            )
            .await?
            .0,
        200
    );
    let again = json!({"baseRevision":revision,"commands":text["commands"]});
    assert_eq!(
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &again).await?.0,
        403
    );
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["revision"],
        revision
    );
    // Invalid native intent (unknown block) is refused and the room is unchanged.
    client
        .call("PUT", "/documents/v1/rooms/notes/service-access", "alice", &json!({"editor":true}))
        .await?;
    let unknown = json!({"baseRevision":revision,"commands":[serde_json::to_value(Command::InsertText(InsertText{block:"missing".into(),offset:0,text:"x".into()}))?]});
    assert_eq!(
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &unknown).await?.0,
        400
    );
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["revision"],
        revision
    );
    // ... and the next valid injection still succeeds on the same service writer.
    let (status, after) =
        client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &again).await?;
    assert_eq!(status, 200, "{after}");
    assert_eq!(after["receipt"]["receipt"]["writer"], writer);
    Ok(())
}

#[derive(Clone, Default)]
struct Received(Arc<Mutex<Vec<(String, String, Vec<u8>)>>>);
/// Local webhook receiver: answers 500 to the first `failures` requests, then 204.
async fn receiver(failures: usize) -> Result<(SocketAddr, Received)> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let address = listener.local_addr()?;
    let received = Received::default();
    let log = received.clone();
    tokio::spawn(async move {
        let mut seen = 0;
        while let Ok((mut stream, _)) = listener.accept().await {
            let mut data = Vec::new();
            let mut buffer = [0_u8; 4096];
            let (head, body) = loop {
                let Ok(read) = stream.read(&mut buffer).await else {
                    break (String::new(), Vec::new());
                };
                if read == 0 {
                    break (String::new(), Vec::new());
                }
                data.extend_from_slice(&buffer[..read]);
                if let Some(end) = data.windows(4).position(|w| w == b"\r\n\r\n") {
                    let head = String::from_utf8_lossy(&data[..end]).to_lowercase();
                    let length: usize = head
                        .lines()
                        .find_map(|l| l.strip_prefix("content-length: "))
                        .and_then(|v| v.trim().parse().ok())
                        .unwrap_or(0);
                    while data.len() < end + 4 + length {
                        let Ok(read) = stream.read(&mut buffer).await else { break };
                        if read == 0 {
                            break;
                        }
                        data.extend_from_slice(&buffer[..read]);
                    }
                    break (head, data[end + 4..].to_vec());
                }
            };
            let signature = head
                .lines()
                .find_map(|l| l.strip_prefix(&format!("{WEBHOOK_SIGNATURE_HEADER}: ")))
                .unwrap_or("")
                .to_owned();
            let event = head
                .lines()
                .find_map(|l| l.strip_prefix("x-breditor-webhook-event: "))
                .unwrap_or("")
                .to_owned();
            seen += 1;
            let status =
                if seen <= failures { "500 Internal Server Error" } else { "204 No Content" };
            log.0.lock().expect("receiver log").push((event, signature, body));
            let _ = stream
                .write_all(format!("HTTP/1.1 {status}\r\ncontent-length: 0\r\n\r\n").as_bytes())
                .await;
        }
    });
    Ok((address, received))
}
async fn wait_for(received: &Received, event: &str, count: usize) -> Result {
    for _ in 0..100 {
        if received.0.lock().map_err(|_| "lock")?.iter().filter(|(e, _, _)| e == event).count()
            >= count
        {
            return Ok(());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    Err(format!("timed out waiting for {event}").into())
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn webhooks_are_signed_debounced_retried_logged_and_never_block() -> Result {
    let directory = Directory::new()?;
    let accounts = Accounts::new()?;
    let (hook, received) = receiver(1).await?;
    // A second endpoint that refuses connections: it must be abandoned without blocking anything.
    let dead = TcpListener::bind("127.0.0.1:0").await?.local_addr()?;
    let config = api_config(
        &json!({"debounceMillis":150,"maxAttempts":3,"retryBaseMillis":20,"timeoutMillis":500,
        "endpoints":[
            {"id":"local","url":format!("http://{hook}/hooks/breditor"),"secret":SECRET,
             "events":["document.changed","comment.created","comment.resolved","room.created","room.deleted"]},
            {"id":"dead","url":format!("http://{dead}/"),"secret":SECRET,"events":["room.created"]}
        ]}),
    );
    let (server, address) = serve(&directory, &accounts, &config).await?;
    let client = Client { address, accounts: &accounts };
    let started = std::time::Instant::now();
    assert_eq!(
        client.call("POST", "/documents/v1/rooms", "alice", &create_body("notes", true)?).await?.0,
        201
    );
    assert!(started.elapsed() < Duration::from_secs(2), "webhooks must not block the request");
    // First attempt answered 500; the bounded retry delivers the same signed event.
    wait_for(&received, "room.created", 2).await?;

    // Two quick injections coalesce into debounced change notifications naming the latest revision.
    let mut revision =
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["revision"]
            .clone();
    for text in ["One ", "Two "] {
        let body = json!({"baseRevision":revision,"commands":[serde_json::to_value(Command::InsertText(InsertText{block:"body".into(),offset:0,text:text.into()}))?]});
        let injected =
            client.call("POST", "/documents/v1/rooms/notes/injections", "alice", &body).await?.1;
        revision = injected["revision"].clone();
    }
    wait_for(&received, "document.changed", 1).await?;
    tokio::time::sleep(Duration::from_millis(500)).await;

    // Comments: review authored through the native review lane, observed via the same channels.
    let profile = profile()?;
    let (session_frame, anchor) = server
        .with_room("notes", |room| {
            room.enable_review("alice")?;
            let registration = room.register_observer("alice")?;
            Ok((room.catchup("alice")?, registration.lease.writer))
        })
        .await?;
    let source = profile.join_frame("notes".into(), anchor, &session_frame)?;
    let policy = ReviewActorPolicy {
        actor: ReviewActorId::try_new("alice.comments")?,
        principal: ReviewPrincipalId::try_new("alice")?,
        access: ReviewAccess::Moderate,
    };
    let mut review = source.create_review_session(policy)?;
    let observed = review.observe();
    let ReviewOutcome::Committed(event) = source.dispatch_review_guarded(
        &source.observe()?,
        &mut review,
        &observed,
        ReviewAction::CreateThread(CreateReviewThread {
            anchor_json: source
                .capture_review_anchor_guarded(&source.observe()?, &ReviewAnchorTarget::Document)?,
            body: "Please confirm the summary".into(),
        }),
    )?
    else {
        return Err("thread".into());
    };
    let thread = ReviewThreadId::from_event(event);
    let first = review.export_frame(0)?;
    let lease = server
        .with_room("notes", move |room| {
            let registration = room.register_review(
                "alice",
                ReviewActorId::try_new("alice.comments")
                    .map_err(|_| breditor_collab_relay::Error::Contract("actor"))?,
            )?;
            assert!(matches!(
                room.admit_review("alice", &registration.lease, &first)?,
                ReviewAdmission::Durable(_)
            ));
            Ok(registration.lease)
        })
        .await?;
    wait_for(&received, "comment.created", 1).await?;
    let observed = review.observe();
    source.dispatch_review_guarded(
        &source.observe()?,
        &mut review,
        &observed,
        ReviewAction::SetThreadState(SetReviewThreadState { thread, resolved: true }),
    )?;
    let second = review.export_frame(1)?;
    server
        .with_room("notes", move |room| {
            assert!(matches!(
                room.admit_review("alice", &lease, &second)?,
                ReviewAdmission::Durable(_)
            ));
            Ok(())
        })
        .await?;
    wait_for(&received, "comment.resolved", 1).await?;
    let threads =
        client.call("GET", "/documents/v1/rooms/notes/threads", "alice", &Value::Null).await?.1;
    assert_eq!(threads["threads"][0]["state"], "resolved");
    assert_eq!(
        threads["threads"][0]["messages"][0]["versions"][0]["text"],
        "Please confirm the summary"
    );

    // Archival: owner-only, refused while a socket is live, retains every byte under archive/.
    let (socket, _) = connect(address, "notes", &accounts).await?;
    assert_eq!(
        client.call("DELETE", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.1["code"],
        "room_in_use"
    );
    drop(socket);
    let mut archived = (0, Value::Null);
    for _ in 0..50 {
        archived =
            client.call("DELETE", "/documents/v1/rooms/notes", "alice", &Value::Null).await?;
        if archived.0 == 200 {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    assert_eq!(archived.0, 200, "{}", archived.1);
    wait_for(&received, "room.deleted", 1).await?;
    assert_eq!(
        client.call("GET", "/documents/v1/rooms/notes", "alice", &Value::Null).await?.0,
        404
    );
    assert!(!directory.0.join("notes.log").exists());
    let names: Vec<String> = fs::read_dir(directory.0.join("archive"))?
        .filter_map(|e| e.ok()?.file_name().into_string().ok())
        .collect();
    assert!(
        names.iter().any(|n| n.ends_with(".log"))
            && names.iter().any(|n| n.ends_with(".service.json"))
    );

    // Every delivery is verifiably signed; a replayed signature outside the window is refused.
    let now = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH)?.as_secs();
    let deliveries = received.0.lock().map_err(|_| "lock")?.clone();
    for (event, signature, body) in &deliveries {
        assert!(verify_webhook_signature(SECRET.as_bytes(), signature, body, now, 300), "{event}");
        assert!(!verify_webhook_signature(SECRET.as_bytes(), signature, body, now + 3_600, 300));
        assert!(!verify_webhook_signature(
            b"wrong-secret-0123456789abcdef-0123",
            signature,
            body,
            now,
            300
        ));
        let payload: Value = serde_json::from_slice(body)?;
        assert_eq!(
            (payload["format"].as_str(), payload["event"].as_str(), payload["room"].as_str()),
            (Some("breditor/relay-webhook"), Some(event.as_str()), Some("notes"))
        );
        // Payloads carry identifiers, never document or comment content.
        assert!(!String::from_utf8_lossy(body).contains("Please confirm"));
    }
    let changed: Vec<Value> = deliveries
        .iter()
        .filter(|(e, _, _)| e == "document.changed")
        .map(|(_, _, b)| serde_json::from_slice::<Value>(b).map(|v| v["data"]["revision"].clone()))
        .collect::<std::result::Result<_, _>>()?;
    assert!(changed.len() <= 2, "debounced: {changed:?}");
    assert_eq!(changed.last(), Some(&revision));

    // The delivery log shows the retry, final delivery and the abandoned dead endpoint.
    let mut log = Value::Null;
    for _ in 0..60 {
        log =
            client.call("GET", "/documents/v1/webhooks/deliveries", "admin", &Value::Null).await?.1;
        if log["deliveries"]
            .as_array()
            .is_some_and(|d| d.iter().any(|r| r["outcome"] == "abandoned"))
        {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    let records = log["deliveries"].as_array().ok_or("deliveries")?;
    let local_created: Vec<&Value> = records
        .iter()
        .filter(|r| r["endpoint"] == "local" && r["event"] == "room.created")
        .collect();
    assert_eq!(
        local_created.iter().map(|r| r["outcome"].as_str().unwrap_or("")).collect::<Vec<_>>(),
        ["retrying", "delivered"]
    );
    assert_eq!(local_created[0]["status"], 500);
    assert!(
        records
            .iter()
            .any(|r| r["endpoint"] == "dead" && r["outcome"] == "abandoned" && r["attempt"] == 3)
    );
    assert!(!log.to_string().contains(SECRET));
    Ok(())
}
