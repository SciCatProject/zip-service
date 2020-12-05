import express from "express";
import config from "../local.config.json"
export const router = express.Router();


router.get('/', function(req, res, next) {
    let jwt = "";
    let directory = "";
    let file0 = "";  
    let file1 = "";
    let file2 = "";
    try {
        jwt = config.testData.jwt;
        directory = config.testData.directory;
        file0 = config.testData.files[0];
        file1 = config.testData.files[1];
        file2 = config.testData.files[2];

       }catch (e) {}//defaulting to empty strings
    res.render('index', {jwt, directory, file0, file1, file2} );
});
