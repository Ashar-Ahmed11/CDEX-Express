const express = require('express')
const router = express.Router()
const Admin = require('../models/user')
const bcrypt = require('bcryptjs')
const jwt = require('jsonwebtoken')
const { readContract } = require('@wagmi/core')
const fetchUser = require('../middleware/fetchUser')
const { config, account } = require('../config')
const JWT_SECRET = 'ashar.2day@karachi'

const CREATE2_FACTORY_ADDRESS = "0xC2c1C12f354CB5579414B9FBB48fa2993C157F63"
const create2FactoryAbi = [
    {
        inputs: [{ internalType: 'uint256', name: '_salt', type: 'uint256' }],
        name: 'getWalletAddress',
        outputs: [{ internalType: 'address', name: '', type: 'address' }],
        stateMutability: 'view',
        type: 'function'
    }
]

router.post('/createuser', async(req, res) => {
    try {
        const email = req.body.email
        const existingUser = await Admin.findOne({ email: email })

        if (existingUser) {
            return res.status(400).send("That user with the email already exists.")
        }

        if (!CREATE2_FACTORY_ADDRESS) {
            return res.status(500).send('CREATE2_FACTORY_ADDRESS is not configured')
        }

        const totalUsers = await Admin.countDocuments()
        const saltNumber = totalUsers + 1
        const generatedAddress = await readContract(config, {
            abi: create2FactoryAbi,
            address: CREATE2_FACTORY_ADDRESS,
            functionName: 'getWalletAddress',
            args: [BigInt(saltNumber)],
            chainId: 31337,
            account: account
        })

        const salt = await bcrypt.genSalt(10)
        const hash = await bcrypt.hash(req.body.password, salt)
        const data = {
            username: req.body.username,
            email: email,
            password: hash,
            salt: saltNumber,
            address: generatedAddress
        }

        const admin = await Admin.create(data)
        admin.save()

        const authTokenData = {
            user: admin._id
        }
        const authToken = jwt.sign(authTokenData, JWT_SECRET)

        res.json({ authToken })
    } catch (error) {
        console.error(error)
        res.status(500).send('Internal Server Error')
    }
})

router.post('/login', async(req, res) => {
    try {
        const email = req.body.email
        const user = await Admin.findOne({ email: email })
        if (!user) {
            return res.status(404).send("Please enter correct credentials")
        }
        const pass = await bcrypt.compare(req.body.password, user.password)
        if (!pass) {
            return res.status(404).send("Please enter correct credentials")
        }
        const data = {
            user: user._id
        }
        const authToken = jwt.sign(data, JWT_SECRET)
        res.json({ authToken })
    } catch (error) {
        console.error(error)
        res.status(500).send('Internal Server Error')
    }
})

router.get('/get-user', fetchUser, async(req, res) => {
    try {
        const user = await Admin.findById(req.user).select('-password')
        res.json(user)
    } catch (error) {
        console.error(error)
        res.status(500).send('Internal Server Error')
    }
})


module.exports = router
