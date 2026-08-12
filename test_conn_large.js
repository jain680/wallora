
async function test() {
    try {
        console.log("Generating large payload...");
        // Create a ~5MB string
        const largeStr = "A".repeat(5 * 1024 * 1024);

        console.log("Attempting to fetch http://127.0.0.1:5000/segment with large payload...");
        const response = await fetch('http://127.0.0.1:5000/segment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                image: largeStr, // Not a valid base64 image, but tests size handling
                mimeType: "image/png"
            })
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
