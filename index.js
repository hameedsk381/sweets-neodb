const express = require('express');
const axios = require('axios');
const { JSDOM } = require('jsdom');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const juice = require('juice');
const multer = require('multer');
const app = express();
const port = 3000; // You can choose any port


app.use(cors()); // Allow CORS to all
app.use(bodyParser.json()); // Support json encoded bodies
app.use(bodyParser.urlencoded({ extended: true })); // Support encoded bodies
app.use(express.json());
const pool = require('./db');

// Define the destination paths for uploads and sweets
const uploadDestination = 'uploads/';
const sweetsDestination = 'sweets/';

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
const Datastore = require('nedb');

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
// Route for multiple file upload
app.post('/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: 'Error uploading file' });
        } else {
            if (!req.file) {
                res.status(400).json({ message: 'No file uploaded' });
            } else {
                const filePath = req.file.path;
                res.status(200).json(filePath);
            }
        }
    });
});

// Route to delete a file from uploads folder
app.delete('/delete-file/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(uploadDestination, filename);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error(err);
            res.status(500).json({ message: 'Error deleting file' });
        } else {
            res.status(200).json({ message: 'File deleted successfully' });
        }
    });
});
app.post('/sweets/create-renarration', sweetsUpload.any(), (req, res) => {
    try {
        let renarration = req.body  // Assuming renarration data (except media) is sent as a JSON string
        renarration.blocks.forEach((block, index) => {
            // Process file sweets for each block
          if(req.files){
              const blockFiles =  req.files.filter(file => file.fieldname === `block${index}image` || file.fieldname === `block${index}audio` || file.fieldname === `block${index}video`);
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

app.get('/sweets/renarrations/:id', (req, res) => {
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

app.get('/sweets/renarrations', (req, res) => {
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