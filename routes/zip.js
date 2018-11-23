const express = require('express');
const router = express.Router();
const fs = require('fs');
const ZIP_FILES_PATH = require('../constants');
db = new Object();
const ENTRY_CURRENT = "CURRENT";
const ENTRY_NBR_OF_FILES = "TOTAL";
const ENTRY_FILENAME = "FILENAME";

router.get('/', function(req, res, next) {
	console.log("GET /zip");
	res.statusCode = 400;
	res.send("Only accepts POST");
	return;
});

/* POST zip */
router.post('/', function(req, res, next){
	const json = JSON.parse(req.body.data);
	console.log(json);
	const path = json["base"];
	if (!path || path.length === 0){
		res.render("error", {msg: "JSON missing 'base'"})
		return;
	}
	const files = json["files"];
	console.log("PATH: " + files);
	if (!files || files.length === 0){
		res.statusCode = 400;
		res.send("JSON missing 'files'");
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
		res.render("zipping", {total: ("" + files.length), file: zipFileName});
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
		files.map(file => zipSingleFile(path, file, archive));
	}catch(error){
		console.log("Failed zipping " + path + "/" + file);
	}
	
	archive.finalize();

}
const zipSingleFile = (path, file, archive)  => {
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
		res.send(db[req.params.file][ENTRY_CURRENT] + "");
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
}

const setDone = (id, filename) => {
	db[id][ENTRY_CURRENT] = db[id][ENTRY_NBR_OF_FILES];
	db[id][ENTRY_FILENAME] = filename;
}

module.exports = router;