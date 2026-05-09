const express = require("express");
const next = require("next");

const dev = process.env.NODE_ENV !== "production";
const app = next({ dev });
const handle = app.getRequestHandler();
const port = parseInt(process.env.PORT || "3000", 10);

app
  .prepare()
  .then(() => {
    const server = express();

    server.use(express.json({ limit: "10mb" }));
    server.use(express.urlencoded({ extended: true }));

    server.get("/health", (_req, res) => {
      res.status(200).json({ ok: true, service: "resumora" });
    });

    server.all("*splat", (req, res) => handle(req, res));

    server.listen(port, (err) => {
      if (err) throw err;
      console.log(`Resumora running on port ${port}`);
    });
  })
  .catch((err) => {
    console.error("Failed to start server", err);
    process.exit(1);
  });
