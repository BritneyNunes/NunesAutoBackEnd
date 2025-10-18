import { expect, use } from 'chai';
import chaiHttp from 'chai-http';
import { app, connectToMongo, client } from '../server.js';

const chai = use(chaiHttp);

// 1. Connect to MongoDB once before all tests
before(async function() {
  this.timeout(15000); 
  try {
    console.log("Connecting to MongoDB for tests...");
    await connectToMongo(); 
    console.log("MongoDB connection successful. Starting tests.");
  } catch (err) {
    console.error("Test setup failed: Could not connect to MongoDB.", err);
    throw err;
  }
});

// 2. Close the MongoDB connection after all tests
after(async function() {
  if (client) {
    console.log("Closing MongoDB connection.");
    await client.close(); 
  }
});

describe('POST /users', () => {
  it('should create a new user successfully', (done) => {
    const userData = {
      data: {
        NameAndSurname: "Britney Smith",
        Email: `britney${Date.now()}@example.com`, 
        Password: "password123",
        Gender: "Female",
        UserNumber: "1234567890"
      }
    };

    chai.request.execute(app) 
      .post('/users')
      .send(userData)
      .end((err, res) => {
        if (err) {
          console.error('Request error:', err);
          done(err);
          return;
        }

        console.log("Response body:", res.body);

        expect(res).to.have.status(201);
        expect(res.body).to.have.property('message', 'User created successfully');
        expect(res.body.user).to.have.property('Email', userData.data.Email);
        done();
      });
  });
});

describe('GET /brands', () => {
  it('should retrieve a list of brands and return 200 status', (done) => {
    chai.request.execute(app) 
      .get('/brands') 
      .end((err, res) => {
        if (err) {
          console.error('Request error:', err);
          done(err);
          return;
        }

        console.log("Response body:", res.body);

        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });
});

describe('GET /parts', () => {
  it('should retrieve a list of parts and return 200 status', (done) => {
    chai.request.execute(app) 
      .get('/parts') 
      .end((err, res) => {
        if (err) {
          console.error('Request error:', err);
          done(err);
          return;
        }

        console.log("Response body:", res.body);

        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });
});

describe('GET /cart', () => {
  it('should retrieve a list of items in cart and return 200 status', (done) => {
    chai.request.execute(app) 
      .get('/cart') 
      .end((err, res) => {
        if (err) {
          console.error('Request error:', err);
          done(err);
          return;
        }

        console.log("Response body:", res.body);

        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });
});

describe('GET /orders', () => {
  it('should retrieve a list of orders and return 200 status', (done) => {
    chai.request.execute(app) 
      .get('/orders') 
      .end((err, res) => {
        if (err) {
          console.error('Request error:', err);
          done(err);
          return;
        }

        console.log("Response body:", res.body);

        expect(res).to.have.status(200);
        expect(res.body).to.be.an('array');
        done();
      });
  });
});

