const PORT = 80;

import history from 'connect-history-api-fallback';
import express from 'express';
import http from 'http';

async function main() {
    const app = express();
    const server = http.createServer(app);
    app.use(history());
    app.use(express.static("./dist"));

    server.listen(PORT, () => {
        console.log("Server started at: ", PORT);
    });
}

main();