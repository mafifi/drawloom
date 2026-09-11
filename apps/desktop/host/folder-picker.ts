/** Native macOS dialog without exposing a Tauri capability to remote web content. */
export async function pickMacProjectDirectory(signal:AbortSignal):Promise<string|undefined>{
  signal.throwIfAborted();
  // The script is constant. Browser strings never become shell or AppleScript.
  const child=Bun.spawn(['/usr/bin/osascript','-e','try\nPOSIX path of (choose folder with prompt "Choose a Drawloom project folder")\non error number -128\nreturn ""\nend try'],{stdout:'pipe',stderr:'ignore'});
  const cancel=()=>child.kill();signal.addEventListener('abort',cancel,{once:true});
  try{
    const [text,status]=await Promise.all([new Response(child.stdout).text(),child.exited]);
    signal.throwIfAborted();if(status!==0)throw Error('Native folder selection failed');
    return text.trim()||undefined;
  }finally{signal.removeEventListener('abort',cancel);}
}
