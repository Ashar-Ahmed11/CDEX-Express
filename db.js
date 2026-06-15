const mongoose = require('mongoose')

const URI = 'mongodb+srv://akhuwat:UIAZGDS@akhuwat-database.l9ey8xt.mongodb.net/cdex'

mongoose.set("strictQuery", false);
const connectToMongo = () => mongoose.connect(URI, () => {
    console.log("Connected to Mongo Successfully")
})

module.exports = connectToMongo