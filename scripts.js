document.getElementById('uploadForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fileInput = document.getElementById('fileInput');
    const file = fileInput.files[0];

    if (!file) {
        alert('Please select a file');
        return;
    }

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('http://127.0.0.1:3000/upload', {
            method: 'POST',
            body: formData
        });

        if (response.ok) {
            const result = await response.json();
            if (result.area) {
                document.getElementById('result').innerText = `Parking Area: ${result.area}`;
            } else {
                document.getElementById('result').innerText = `Error: ${result.error}`;
            }
        } else {
            const error = await response.json();
            document.getElementById('result').innerText = `Error: ${error.error}`;
        }
    } catch (error) {
        document.getElementById('result').innerText = `Error: ${error.message}`;
    }
});
