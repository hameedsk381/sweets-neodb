
import express from 'express';
import axios from 'axios';
import { JSDOM } from 'jsdom';
import bodyParser from 'body-parser';
import { v4 as uuidv4 } from 'uuid';
import cors from 'cors';
import juice from 'juice';
import multer from 'multer';
import path from 'path';
import { create } from 'kubo-rpc-client';
import Datastore from 'nedb';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Now you can use __dirname

const app = express();
const port = 4000; // You can choose any port


app.use(cors()); // Allow CORS to all
app.use(bodyParser.json()); // Support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // Support encoded bodies
app.use(express.json());

// Define the destination paths for uploads and sweets
const uploadDestination = 'uploads/';
const sweetsDestination = 'sweets/';



// connect to the default API address http://localhost:5001
const client = create()




// Configure Multer for uploads
const upload = multer({
    limits: { fileSize: 200 * 1024 * 1024 },
    dest: uploadDestination
});

// Configure Multer for sweets
const sweetsUpload = multer({
    limits: { fileSize: 200 * 1024 * 1024 },
    dest: sweetsDestination
});



const renarrationsDb = new Datastore({ filename: './sweets.db', autoload: true });
const insertRenarration = (renarrationData, callback) => {
    const sharingId = Math.floor(100000 + Math.random() * 900000); // Generate 6 digit id
    const renarrationDataFinal = {
        sharingId: sharingId, ...renarrationData
    }
    renarrationsDb.insert(renarrationDataFinal, callback);
};
const getAllRenarrations = (callback) => {
    renarrationsDb.find({}, callback);
};
const updateRenarration = (id, renarrationData, callback) => {
    renarrationsDb.findOne({ _id: id }, (err, doc) => {
        if (err) {
            callback(err);
        } else {
            if (doc) {
                renarrationsDb.update({ _id: id }, { $set: renarrationData }, {}, callback);
            } else {
                callback(new Error('Renarration not found'));
            }
        }
    });
};
const deleteRenarration = (id, callback) => {
    renarrationsDb.remove({ _id: id }, {}, callback);
};
const getRenarrationById = (id, callback) => {
    renarrationsDb.findOne({ _id: id }, callback);
};

// Route to receive file from client and add it to IPFS
app.post('/upload', upload.single('file'), async (req, res) => {
    try {
        // Check if file was provided
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        // Get file content from the request
     
        const fileContent = path.resolve(__dirname, req.file.path);

        // Add the file content to IPFS
        const { cid } =  client.files.write(fileContent);

        // Respond with the CID of the uploaded image
        res.json({ cid: cid });
    } catch (error) {
        console.error('Error uploading image:', error);
        res.status(500).json({ error: 'Failed to upload image' });
    }
});

app.post('/create-renarration', sweetsUpload.any(), (req, res) => {
    try {
        let renarration = req.body  // Assuming renarration data (except media) is sent as a JSON string
        renarration.blocks.forEach((block, index) => {
            // Process file sweets for each block
            if (req.files) {
                const blockFiles = req.files.filter(file => file.fieldname === `block${index}image` || file.fieldname === `block${index}audio` || file.fieldname === `block${index}video`);
                blockFiles.forEach(file => {
                    if (file.fieldname === `block${index}image`) {
                        block.image = `/sweets/${file.filename}`;
                    } else if (file.fieldname === `block${index}audio`) {
                        block.audio = `/sweets/${file.filename}`;
                    } else if (file.fieldname === `block${index}video`) {
                        block.video = `/sweets/${file.filename}`;
                    }
                });
            }
        });
        // Insert the renarration data into the database
        insertRenarration(renarration, (err, newDoc) => {
            if (err) return res.status(500).send(err);
            res.status(201).json(newDoc);
        });
    } catch (error) {
        console.error('Error processing the request:', error);
        res.status(500).send('Error processing the request');
    }
});

app.get('/renarrations/:id', (req, res) => {
    const id = req.params.id;

    getRenarrationById(id, (err, doc) => {
        if (err) {
            console.error('Error fetching renarration:', err);
            return res.status(500).send('Error fetching renarration');
        }

        if (!doc) {
            return res.status(404).send('Renarration not found');
        }

        res.json(doc);
    });
});
app.get('/', (req, res) => {
    res.send('Server is running');
});

app.get('/renarrations', (req, res) => {
    getAllRenarrations((err, docs) => {
        if (err) return res.status(500).send(err);
        res.json(docs);
    });
});

app.put('/renarrations/:id', sweetsUpload.any(), (req, res) => {
    try {
        const id = req.params.id;
        let renarration = req.body  // Assuming renarration data (except media) is sent as a JSON string
        renarration.blocks.forEach((block, index) => {
            const blockFiles = req.files.filter(file => file.fieldname === `block${index}image` || file.fieldname === `block${index}audio` || file.fieldname === `block${index}video`);
            blockFiles.forEach(file => {
                if (file.fieldname === `block${index}image`) {
                    block.image = `/sweets/${file.filename}`;
                } else if (file.fieldname === `block${index}audio`) {
                    block.audio = `/sweets/${file.filename}`;
                } else if (file.fieldname === `block${index}video`) {
                    block.video = `/sweets/${file.filename}`;
                }
            });
        });
        // Update the renarration in the database
        updateRenarration(id, renarration, (err, numReplaced) => {
            if (err) return res.status(500).send(err);
            res.json({ message: 'Renarration updated', numReplaced });
        });
    } catch (error) {
        console.error('Error processing the request:', error);
        res.status(500).send('Error processing the request');
    }
});
app.delete('/renarrations/:id', (req, res) => {
    const id = req.params.id;
    deleteRenarration(id, (err, numRemoved) => {
        if (err) return res.status(500).send(err);
        res.json({ message: 'Renarration deleted', numRemoved });
    });
});
app.get('/verify-sharing/:sharingId', (req, res) => {
    const sharingId = req.params.sharingId;

    renarrationsDb.findOne({ sharingId: parseInt(sharingId) }, (err, doc) => {
        if (err) {
            console.error('Error fetching renarration:', err);
            return res.status(500).send('Error fetching renarration');
        }

        if (!doc) {
            return res.status(404).send('Renarration with the provided sharing ID not found');
        }

        res.json(doc);
    });
});
app.post('/download', async (req, res) => {
    const { url } = req.body;
    const device = req.headers['User-Agent'];

    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': device
            }
        });

        const dom = new JSDOM(response.data);
        const document = dom.window.document;



        // Select all SVG elements and replace them with a small logo size SVG
        const svgElements = document.querySelectorAll('svg');
        svgElements.forEach(svg => {
            svg.setAttribute('width', '50');
            svg.setAttribute('height', '50');

        });
        // Your existing code to manipulate other elements
        const allElements = document.querySelectorAll('*');
        allElements.forEach(el => {
            // el.removeAttribute('onclick');
            el.removeAttribute('onmouseover');
            el.removeAttribute('onmouseout');
            // el.removeAttribute('href');
            if (el.style.position === 'fixed' || el.style.position === 'sticky') {
                el.style.position = 'static';
            }
            const existingDataId = el.getAttribute('data-id');
            if (!existingDataId || existingDataId === '') {
                el.setAttribute('data-id', uuidv4());
            } else {
                el.setAttribute('data-id', uuidv4());
            }
        });

        // Convert all CSS to inline styling using juice
        const htmlContent = juice(dom.serialize());

        res.header('Content-Type', 'text/html');
        res.send(htmlContent);

    } catch (error) {
        console.error('This page cannot be renarrated at the moment:', error);
        res.status(500).send('This page cannot be renarrated at the moment');
    }
});



// // Serve static files from the 'downloads' directory
app.use('/sweets', express.static('sweets'));
app.use('/uploads', express.static('uploads'));

// app.use('/downloads', express.static(path.join(__dirname, 'downloads')));

app.listen(port, () => {
    console.log(`Server is running on port : ${port}`);
});