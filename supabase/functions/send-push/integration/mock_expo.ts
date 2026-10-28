// Stand-in for the Expo push service. Records every request body to $MOCK_LOG and answers per token:
// tokens containing "dead" are reported as DeviceNotRegistered, everything else is ok.
const log = Deno.env.get("MOCK_LOG")!;
Deno.serve({ port: 8788, hostname: "0.0.0.0" }, async (req) => {
  const messages = await req.json() as { to: string }[];
  await Deno.writeTextFile(log, JSON.stringify(messages) + "\n", {
    append: true,
  });
  return Response.json({
    data: messages.map((m) =>
      m.to.includes("dead")
        ? {
          status: "error",
          message: "gone",
          details: { error: "DeviceNotRegistered" },
        }
        : { status: "ok", id: "x" }
    ),
  });
});
