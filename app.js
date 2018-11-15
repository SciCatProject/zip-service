const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const ZIP_FILES_PATH = require('./constants');
const indexRouter = require('./routes/index');
const zipRouter = require('./routes/zip');
const downloadRouter = require('./routes/download');
const bodyParser = require('body-parser');
const session =  require('express-session');
const fs = require('fs');
const rimraf = require('rimraf');

var app = express();
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'fj9832mnsaf3j9adsa', resave: false, saveUninitialized: true, }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', indexRouter);
app.use('/zip', zipRouter);
app.use('/download', downloadRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', {msg: " 500 - Internal server error:" + err.message});
});

//Delete all zip files in ZIP_FILES_PATH older than one hour.
const deleteZipFiles = () => {
  try{
    fs.readdir(ZIP_FILES_PATH, function(err, files) {
      files.forEach(function(file, index) {
        fs.stat(path.join(ZIP_FILES_PATH, file), function(err, stat) {
          var endTime, now;
          if (err) {
            return console.error(err);
          }
          now = new Date().getTime();
          endTime = new Date(stat.ctime).getTime() + 60 * 60 * 1000;
          if (now > endTime) {
            return rimraf(path.join(ZIP_FILES_PATH, file), function(err) {
              if (err) {
                return console.error(err);
              }
              console.log('successfully deleted');
            });
          }
        });
      });
    });
  }catch(error){
    console.log("Couldn't delete files");
  }
}
setInterval(deleteZipFiles, 60 * 60 * 1000);

module.exports = app;