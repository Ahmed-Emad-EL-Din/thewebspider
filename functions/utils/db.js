const { MongoClient } = require('mongodb');

let client;
let clientPromise;

const uri = process.env.MONGO_URI;

if (!process.env.MONGO_URI) {
  throw new Error('Please add your Mongo URI to .env');
}

if (process.env.NODE_ENV === 'development') {
  // In development mode, use a global variable so that the value
  // is preserved across module reloads caused by HMR (Hot Module Replacement).
  if (!global._mongoClientPromise) {
    client = new MongoClient(uri);
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise;
} else {
  // In production mode, it's best to not use a global variable.
  client = new MongoClient(uri);
  clientPromise = client.connect();
}

async function getDb() {
  const connectedClient = await clientPromise;
  return connectedClient.db('thewebspider');
}

module.exports = { getDb };
