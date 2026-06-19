const mongoose = require('mongoose')


const { Schema } = mongoose;

const transactionSchema = new Schema({
    transactionType: {
        type: 'String',
        required: 'True',
         enum: ['swap', 'transfer']
    }, 
          transferToken: {
        type: 'String',
        
    },
       transferTokenAmount: {
        type: 'String',
        
    },
     from: {
        type: 'String',
        
    },

         to: {
        type: 'String',
       
    },
    swapper: {
        type: 'String',
        
    },
       tokenIn: {
        type: 'String',
        
    },

         tokenOut: {
        type: 'String',
       
    },
       tokenOutAmount: {
        type: 'String',
       
    }
    
    
});

module.exports = mongoose.model('transaction', transactionSchema)