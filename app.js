var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');

var indexRouter = require('./routes/index');
var zipRouter = require('./routes/zip');
var downloadRouter = require('./routes/download');
const bodyParser = require('body-parser');
const session =  require('express-session');

var app = express();


app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({ secret: 'fj9832mnsaf3j9adsa', resave: true, saveUninitialized: true, }));
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
  res.render('error', {msg: "catch-all 500 error"});
});

module.exports = app;
