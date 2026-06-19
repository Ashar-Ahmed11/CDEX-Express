const mongoose = require('mongoose')


const { Schema } = mongoose;

const userSchema = new Schema({
    username: {
        type: 'String',
        required: 'True'
    }, 
     email: {
        type: 'String',
        required: 'True'
    },
    password: {
        type: 'String',
        required: 'True'
    },
    salt: {
        type: 'Number',
        required: 'True'
    },
    address: {
        type: 'String',
        required: 'True'
    },
    assets:[
        {type:String}
    ]
});

module.exports = mongoose.model('user', userSchema)