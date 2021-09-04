require('dotenv').config()
const mongoose = require('mongoose')


module.exports = function() { 
    mongoose.connect(process.env.DB_URL, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        useFindAndModify: false,
        useCreateIndex: true
  })
    .then(() => console.log('MongoDB is connected!'))
    .catch(err => console.error(err));
}

