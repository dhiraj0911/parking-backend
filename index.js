const axios = require('axios');
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();
const qs = require('qs');

const upload = multer({ dest: 'uploads/' });

const getAuthToken = async () => {
    console.log("hit 1");
    const client_id = '4vSFKFsi1PDXl73UcdgHrhCndZGD1AmrOMMfPpJ7G0LF1MQw';
    const client_secret = 'Sa4zHfWCAll7oRrlCwvrYIV2sgAwHm2DXMxKx2oEhVOSUSAfkh70zDG0vyG4DtA5';

    try {
        const response = await axios.post(
            'https://developer.api.autodesk.com/authentication/v1/authenticate',
            qs.stringify({
                client_id,
                client_secret,
                grant_type: 'client_credentials',
                scope: 'bucket:read bucket:create data:read data:write'
            }), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );
        console.log("hit 2");
        return response.data.access_token;
    } catch (error) {
        console.error("Error fetching auth token:", error.response ? error.response.data : error);
        throw error;
    }
};

const uploadFile = async (authToken, fileBuffer, fileName) => {
    const response = await axios({
        method: 'PUT',
        url: 'https://developer.api.autodesk.com/oss/v2/buckets/your_bucket_name/objects/' + fileName,
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/octet-stream'
        },
        data: fileBuffer
    });

    return response.data;
};

const translateFile = async (authToken, urn) => {
    const response = await axios({
        method: 'POST',
        url: 'https://developer.api.autodesk.com/modelderivative/v2/designdata/job',
        headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        },
        data: {
            input: {
                urn
            },
            output: {
                formats: [{
                    type: 'svf',
                    views: ['2d', '3d']
                }]
            }
        }
    });

    return response.data;
};

const getModelProperties = async (authToken, urn) => {
    const response = await axios({
        method: 'GET',
        url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata`,
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    return response.data;
};

const getLayerProperties = async (authToken, urn, guid) => {
    const response = await axios({
        method: 'GET',
        url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    return response.data;
};

app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        const authToken = await getAuthToken();
        const fileBuffer = fs.readFileSync(req.file.path);
        const fileName = req.file.originalname;

        const uploadResponse = await uploadFile(authToken, fileBuffer, fileName);
        const urn = Buffer.from(uploadResponse.objectId).toString('base64');

        const translateResponse = await translateFile(authToken, urn);

        if (translateResponse.result === 'success') {
            const modelProperties = await getModelProperties(authToken, urn);
            const guid = modelProperties.data.metadata[0].guid;

            const layerProperties = await getLayerProperties(authToken, urn, guid);

            const parkingLayer = layerProperties.data.collection.find(item => item.name === 'Parking');
            if (parkingLayer) {
                const area = parkingLayer.properties.Area;
                res.json({ area });
            } else {
                res.status(404).json({ error: 'Parking layer not found' });
            }
        } else {
            res.status(500).json({ error: 'Translation failed' });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});
