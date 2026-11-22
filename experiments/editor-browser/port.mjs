export function editorBrowserPort(value=process.env.BREDITOR_EDITOR_PORT??49784){
 const port=Number(value);
 if(!Number.isInteger(port)||port<1024||port>65535)throw Error("Invalid installed editor browser port");
 return port;
}
