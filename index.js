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
        console.error("Error translating file:", error.response ? error.response.data : error);
        throw error;
    }
};

const checkTranslationStatus = async (authToken, urn) => {
    try {
        const response = await axios({
            method: 'GET',
            url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/manifest`,
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });

        return response.data.status;
    } catch (error) {
        console.error("Error checking translation status:", error.response ? error.response.data : error);
        throw error;
    }
};

const getProperties = async (authToken, urn, guid) => {
    try {
        const response = await axios({
            method: 'GET',
            url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata/${guid}/properties`,
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        return response.data.data.collection;
    } catch (error) {
        console.error("Error fetching properties:", error.response ? error.response.data : error);
        throw error;
    }
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

        await translateFile(authToken, urn);

        // Wait for translation to complete
        let translationStatus = 'inprogress';
        while (translationStatus === 'inprogress') {
            translationStatus = await checkTranslationStatus(authToken, urn);
            if (translationStatus === 'failed') {
                throw new Error('Translation failed');
            }
            if (translationStatus === 'success') {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for 5 seconds before checking again
        }

        // Get the metadata GUID
        const metadataResponse = await axios({
            method: 'GET',
            url: `https://developer.api.autodesk.com/modelderivative/v2/designdata/${urn}/metadata`,
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        const guid = metadataResponse.data.data.metadata[0].guid;

        // Get properties
        const properties = await getProperties(authToken, urn, guid);

        // Extract total area for each layer
        const layerAreas = {};
        properties.forEach((item) => {
            if (item.properties && item.properties['General'] && item.properties['General']['Layer']) {
                // console.log(item.properties.General.Handle)
                const handle = item.properties['General']['Handle'];
                const area = parseFloat(item.properties['Geometry']?.Area || 0);
                layerAreas[handle] = { area, layer: item.properties['General']['Layer'] };
            }
        });
        console.log(layerAreas)

        // Calculate total area for open and close parking
        const closeParkingLayer = '23a';
        const plotBoundaryLayer = '267';

        // Open parking area calculation
        const openParkingArea = layerAreas[plotBoundaryLayer].area - layerAreas[closeParkingLayer].area;

        // Close parking area calculation
        let unusedSpace = 0;
        for (const handle in layerAreas) {
            if (layerAreas[handle].layer === 'Parking layer' && handle !== closeParkingLayer) {
                unusedSpace += layerAreas[handle].area;
            }
        }
        const closeParkingArea = layerAreas[closeParkingLayer].area - unusedSpace;

        console.log({ closeParkingArea, openParkingArea });

        res.json({ layerAreas });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Server started on port 3000');
});
