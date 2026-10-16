import { writeFile } from "node:fs/promises";
import { join } from "node:path";

/** An external-agent substitute: stdin/argv stay real, HTTP only coordinates test responses. */
export async function fixtureAgentCli(
  directory: string,
  endpoint: string,
): Promise<string> {
  const path = join(directory, "agent.cjs");
  await writeFile(
    path,
    `#!${process.execPath}
const args = process.argv.slice(2);
let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", part => prompt += part);
process.stdin.on("end", async () => {
  try {
    const codex = args[0] === "exec";
    const setting = args.find(arg => arg.startsWith("developer_instructions="));
    const system = codex ? JSON.parse(setting.slice(setting.indexOf("=") + 1)) : args[args.indexOf("--system-prompt") + 1];
    const model = args.includes("--model") ? args[args.indexOf("--model") + 1] : null;
    const effort = codex ? JSON.parse(args.find(arg => arg.startsWith("model_reasoning_effort=")).split("=")[1]) : args[args.indexOf("--effort") + 1];
    const response = await fetch(${JSON.stringify(endpoint)}, {method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify({messages:[{role:"system", content:system},{role:"user",content:prompt}], model, effort, client:codex?"codex":"claude-code", cwd:process.cwd(), args})});
    if (!response.ok) process.exit(1);
    const body = await response.text();
    let text = "", complete = false;
    for (const block of body.split("\\n\\n")) {
      const data = block.replace(/^data: /, "").trim();
      if (data === "[DONE]") complete = true;
      else if (data.startsWith("{")) text += JSON.parse(data).choices?.[0]?.delta?.content ?? "";
    }
    if (!complete) process.exit(1);
    if (codex) {
      console.log(JSON.stringify({type:"item.completed", item:{type:"agent_message",text}}));
      console.log(JSON.stringify({type:"turn.completed"}));
    } else console.log(JSON.stringify({type:"result",subtype:"success",is_error:false,result:text}));
  } catch { process.exit(1); }
});
`,
    { mode: 0o700 },
  );
  return path;
}
