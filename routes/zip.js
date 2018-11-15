const express = require('express');
const router = express.Router();
const fs = require('fs');
const ZIP_FILES_PATH = require('../constants');
//Don't need a real DB yet, maybe never. Ditching redis for a global object
//var redis = require('redis');
//var client = redis.createClient();
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
		const id = req.session.id;
		initEntry(id, files.length);
		res.render("zipping", {total: ("" + files.length)});
		zipFiles(path, files, id);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}

});
const zipFiles = (path, files, id) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream(ZIP_FILES_PATH + "/" + zipFile);
	const archive = archiver('zip', {
	gzip: true,
	zlib: { level: 9 }
	});

	archive.on('error', function(err) {
		throw err;
	});
	fileStream.on('close', function() {
		setDone(id, "/download?file=" + zipFile);
	});
	archive.on('entry', function(){
		incrementCurrent(id);
	});
	archive.pipe(fileStream);
	try{
		files.map(file => zipSingleFile(path, file, id, archive));
	}catch(error){
		console.log("Failed zipping " + path + "/" + file);
	}
	
	archive.finalize();

}
const zipSingleFile = (path, file, id, archive)  => {
	fs.existsSync(path + "/" + file) ? archive.file(path + "/" + file, { name: file }) : null;
}

router.get("/polling", function(req, res, next){
	if (!db[req.session.id]){
		res.statusCode = 400;
			res.send("Invalid session token");
			return;
	  }
	const fileName = db[req.session.id][ENTRY_FILENAME];
	if (fileName && fileName !== ""){
		res.send(fileName);
	}else{
		res.send(db[req.session.id][ENTRY_CURRENT] + "");
	}	
	});

const incrementCurrent = (id) => {
	db[id][ENTRY_CURRENT]++;
}

const initEntry = (id, nbrFiles) => {
	db[id] = {};
	db[id][ENTRY_CURRENT]  = 0;
	db[id][ENTRY_NBR_OF_FILES] = nbrFiles;
	db[id][ENTRY_FILENAME] = "";
}

const getCounter = (id, callback) => {
	return db[id][ENTRY_CURRENT];
}

const setDone = (id, filename) => {
	db[id][ENTRY_CURRENT] = db[id][ENTRY_NBR_OF_FILES];
	db[id][ENTRY_FILENAME] = filename;
}

module.exports = router;