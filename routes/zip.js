const express = require('express');
const router = express.Router();
const fs = require('fs');
const ZIP_FILES_PATH = require('../constants');
var redis = require('redis');
var client = redis.createClient();
var data = new Object();

router.get('/', function(req, res, next) {
	console.log("GET /zip");
	res.statusCode = 400;
	res.send("Only accepts POST");
	return;
});

/* POST zip */
router.post('/', function(req, res, next){
	const json = JSON.parse(req.body.data);
	console.log("POST /zip");
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
		setRedisEntry(id, files.length, "");
		resetCurrent(id);
		data[id] = 0;
		res.render("zipping", {total: ("" + files.length)});
		zipFiles(path, files, id);
	}catch(error){
		res.statusCode = 500;
		res.send("The files could not be zipped");
		return;
	}

});
module.exports = router;

const zipFiles = (path, files, id) => {
	const zipFile = require('crypto').createHash('md5').update(path).digest("hex") + "_" + new Date().getTime() + ".zip";
	const archiver = require('archiver');
	const fileStream = fs.createWriteStream(ZIP_FILES_PATH + zipFile);
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
		data[id]++;
		console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAA  " + data[id]);
	});
	archive.pipe(fileStream);
	files.map(file => zipSingleFile(path, file, id, archive));
	archive.finalize();

}
const zipSingleFile = (path, file, id, archive)  => {
		fs.existsSync(path + "/" + file) ? archive.file(path + "/" + file, { name: file }) : null;
		
}

router.get("/polling", function(req, res, next){
	
	getRedisEntry(req.session.id, (entry) => {
		if (!entry) return;
		if (entry.filename && entry.filename !== ""){
			res.send(entry.filename);
		}else{
			res.send( data[req.session.id] + "");
			 //getCounter(req.session.id, (result) => {
			 //	res.send(result + "");
			 //});
		}
	});
	
});
const setRedisEntry = (id, total, filename) => {
	const entry = new Object();
	entry.total = total;
	entry.filename = filename;
	client.set(id, JSON.stringify(entry));
}
const getRedisEntry = (id, callback) => {
	client.get(id, function(error, result) {
		if (error) throw error;
		const res = JSON.parse(result);
		callback(res);
	  });
}
const incrementCurrent = (id) => {
	client.incr(id + "_counter");
}
const resetCurrent = (id) => {
	client.set(id + "_counter", 0);
}
const getCounter = (id, callback) => {
	client.get(id + "_counter", function(error, result) {
		if (error) throw error;
		callback(result);
	  });
}
const setDone = (id, filename) => {
	getRedisEntry(id, (entry) => setRedisEntry(id, entry.total, filename))
}