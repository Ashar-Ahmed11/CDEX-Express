const express = require('express')
const app = express()
const port = process.env.PORT || 8000
const cors = require('cors')
const connectToMongo = require('./db')
connectToMongo()
const fileupload = require("express-fileupload");
const { getPublicClient } = require('@wagmi/core')
const { config } = require('./config')
app.use(fileupload({
    useTempFiles: true
}));
app.use(express.json())
app.use(cors({ origin: true }))


const transferEventAbi = {
  type: 'event',
  name: 'Transfer',
  inputs: [
    { indexed: true, name: 'from', type: 'address' },
    { indexed: true, name: 'to', type: 'address' },
    { indexed: false, name: 'value', type: 'uint256' }
  ]
}

const publicClient = getPublicClient(config, {
  chainId: 31337
})

publicClient.watchEvent({
  event: transferEventAbi,
  args: {
    to: "0x79DDdde716D5F6B3F981c56c25D4D966511425DB"
  },
  onLogs: async (logs) => {
    for (const log of logs) {
      const tokenAddress = log.address

        console.log(log)

    //   await User.findOneAndUpdate(
    //     { address: userAddress.toLowerCase() },
    //     {
    //       $addToSet: {
    //         monitoredTokens: tokenAddress
    //       }
    //     }
    //   )
    }
  }
})

// app.use('/api/sendmessage', require('./routes/twilio'))
// app.use('/api/sendemail', require('./routes/email'))
app.use('/api/auth', require('./routes/auth'))
app.use('/api/wallet', require('./routes/wallet'))


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})