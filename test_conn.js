
async function test() {
    try {
        console.log("Attempting to fetch http://127.0.0.1:5000/segment...");
        const response = await fetch('http://127.0.0.1:5000/segment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGP6DwABBAEAwv26tAAAAABJRU5ErkJggg==", mimeType: "image/png" })
        });
        console.log(`Status: ${response.status}`);
        const text = await response.text();
        console.log(`Body: ${text.substring(0, 100)}...`);
    } catch (e) {
        console.error("Fetch failed:", e);
        if (e.cause) console.error("Cause:", e.cause);
    }
}

test();
