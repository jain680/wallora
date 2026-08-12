
const start = async () => {
    try {
        console.log("Testing connection to backend...");
        const response = await fetch('http://127.0.0.1:5000/segment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        console.log("Status:", response.status);
        const text = await response.text();
        console.log("Body:", text);
    } catch (e) {
        console.error("Fetch failed:", e);
    }
};
start();
