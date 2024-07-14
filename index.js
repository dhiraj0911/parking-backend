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

const createBucket = async (authToken, bucketKey) => {
    try {
        const response = await axios({
            method: 'POST',
            url: 'https://developer.api.autodesk.com/oss/v2/buckets',
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/json'
            },
            data: {
                bucketKey: bucketKey,
                policyKey: 'transient' // Or 'temporary', 'persistent' based on your requirement
            }
        });
        console.log("bucket key created")
        return response.data;
    } catch (error) {
        console.error("Error creating bucket:", error.response ? error.response.data : error);
        throw error;
    }
};

const uploadFile = async (authToken, fileBuffer, fileName, bucketKey) => {
    try {
        const response = await axios({
            method: 'PUT',
            url: `https://developer.api.autodesk.com/oss/v2/buckets/${bucketKey}/objects/${fileName}`,
            headers: {
                'Authorization': `Bearer ${authToken}`,
                'Content-Type': 'application/octet-stream'
            },
            data: fileBuffer
        });
        console.log("file uploaded")
        return response.data;
    } catch (error) {
        console.error("Error uploading file:", error.response ? error.response.data : error);

    }
};

const translateFile = async (authToken, urn) => {
    try {
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
    } catch (error) {
        console.error("Error creating bucket:", error.response ? error.response.data : error);
        throw error;
    }
};

const checkTranslationStatus = async (authToken, urn) => {
    const response = await axios({
        method: 'GET',
        url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
        headers: {
            'Authorization': `Bearer ${authToken}`
        }
    });

    return response.data.status;
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

        const bucketKey = 'nezuko1949';
        // await createBucket(authToken, bucketKey);

        const uploadResponse = await uploadFile(authToken, fileBuffer, fileName, bucketKey);
        const urn = Buffer.from(uploadResponse.objectId).toString('base64');

        const translateResponse = await translateFile(authToken, urn);

        console.log(translateResponse)
        if (translateResponse.result === 'created') {
            console.log("hit 1")
            let translationStatus = await checkTranslationStatus(authToken, urn);
            console.log(translationStatus)

            while (translationStatus !== 'success') {
                console.log('Checking translation status...');
                await new Promise(resolve => setTimeout(resolve, 5000)); // wait for 5 seconds before checking again
                translationStatus = await checkTranslationStatus(authToken, urn);
            }

            const modelProperties = await getModelProperties(authToken, urn);
            console.log(modelProperties)
            const guid = modelProperties.data.metadata[0].guid;
            console.log(guid)
            const layerProperties = await getLayerProperties(authToken, urn, guid);
            console.log(layerProperties, "layerproperties")

            console.log(layerProperties.data.collection);

            const parkingLayer = layerProperties.data.collection.find(item => {
                return item.name.toLowerCase().includes('parking');
            });
            
            console.log(parkingLayer)
            if (parkingLayer) {
                const area = parkingLayer.properties.Area;
                res.json({ area });
            } else {
                console.log("not found")
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