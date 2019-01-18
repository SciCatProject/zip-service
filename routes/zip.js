const express = require('express');
const router = express.Router();
const fs = require('fs');
const ZIP_FILES_PATH = require('../constants');
db = new Object();
const ENTRY_CURRENT = "CURRENT";
const ENTRY_NBR_OF_FILES = "TOTAL";
const ENTRY_FILENAME = "FILENAME";
const ZIP_SIZE_AFTER_LAST_COMPLETED_FILE = "ZIP_SIZE_AFTER_LAST_COMPLETED_FILE";
const SIZE_OF_CURRENT_FILE = "SIZE_OF_CURRENT_FILE";
const config = require('../config.json');
const jwt  = require('jsonwebtoken');

/* POST zip */
router.post('/', function(req, res) {
	const data = req.body;
	console.log(data);
	if (!config.jwtSecret){
		res.statusCode = 500;
		res.send("No JWT secret has been set for zip-service");
		return;
	}
	try{
		jwtDecoded = jwt.verify(data["jwt"], config.jwtSecret); 
	}catch(e){
		res.render("error", {msg: "Invalid JSON web token"})
		return;
	}

	const path = data["base"];
	if (!path || path.length === 0){
		res.render("error", {msg: "Data missing 'base'"})
		return;
	}
	var groups = jwtDecoded.groups;
	const valid = groups.filter(group => group.trim() && path.indexOf(group) > -1).length > 0;
	if (!valid){
		res.render("error", {msg: "You are not authorized to access " + path})
		return;
	}

	const files = data["files"];
	if (!files || files.length === 0){
		res.statusCode = 400;
		res.send("Data missing 'files'");
		return;
	}
	if (!fs.existsSync(path)) {
		res.statusCode = 400;
		res.send("Directory '" + path + "' does not exist");
		return;
	}
	try{
		const zipFileName = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
		initEntry(zipFileName, files.length);
		res.render("zipping", {total: (files.length), file: zipFileName});
		zipFiles(path, files, zipFileName);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}

});
const zipFiles = (path, files, zipFileName) => {
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream(ZIP_FILES_PATH + "/" + zipFileName);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 }
	});

	archive.on('error', function(err) {
		throw err;
	});
	fileStream.on('close', function() {
		setDone(zipFileName, "/download/" + zipFileName);
	});
	archive.on('entry', function(){
		incrementCurrent(zipFileName);
	});
	archive.pipe(fileStream);
	try{
		files.map(file => zipSingleFile(path, file, archive, zipFileName));
	}catch(error){
		console.log("Failed zipping " + path + "/" + file);
	}
	
	archive.finalize();

}
const zipSingleFile = (path, file, archive, zipFileName)  => {
	db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE] = getFilesizeInBytes(ZIP_FILES_PATH + "/" + zipFileName);
	db[zipFileName][SIZE_OF_CURRENT_FILE] = getFilesizeInBytes(path + "/" + file);
	fs.existsSync(path + "/" + file) ? archive.file(path + "/" + file, { name: file }) : null;
}

router.get("/polling/:file", function(req, res, next){
	if (!req.params.file){
		res.statusCode = 400;
			res.send("Invalid file");
			return;
	  }
	const fileName = db[req.params.file][ENTRY_FILENAME];
	if (fileName && fileName !== ""){
		res.send(fileName);
	}else{
		res.send((db[req.params.file][ENTRY_CURRENT] + getFractionalProgress(req.params.file)) + "");
	}	
	});

const incrementCurrent = (file) => {
	db[file][ENTRY_CURRENT]++;
}

const initEntry = (zipFileName, nbrFiles) => {
	db[zipFileName] = {};
	db[zipFileName][ENTRY_CURRENT]  = 0;
	db[zipFileName][ENTRY_NBR_OF_FILES] = nbrFiles;
	db[zipFileName][ENTRY_FILENAME] = "";
	db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE] = 0;
	db[zipFileName][SIZE_OF_CURRENT_FILE] = 0;
}

const setDone = (id, filename) => {
	db[id][ENTRY_CURRENT] = db[id][ENTRY_NBR_OF_FILES];
	db[id][ENTRY_FILENAME] = filename;
}

const getFilesizeInBytes = (filename) => {
    const stats = fs.statSync(filename);
    return stats.size;
}

const getFractionalProgress = (zipFileName) => {
	//current size of the zipfile being built
	const zipSize =  getFilesizeInBytes(ZIP_FILES_PATH + "/" + zipFileName);
	//number of bytes that has been written to the zip file that belongs to the current file
	const bytesForCurrentFile = zipSize - db[zipFileName][ZIP_SIZE_AFTER_LAST_COMPLETED_FILE];
	//fraction of that in relation to the total size of the current file (assuming no compression)
	const fraction = bytesForCurrentFile / db[zipFileName][SIZE_OF_CURRENT_FILE];
	return fraction;
}

module.exports = router;