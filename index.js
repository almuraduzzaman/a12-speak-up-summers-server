const express = require('express');
const cors = require('cors');
require('dotenv').config();
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY);
const port = process.env.PORT || 5000;

// middleware 
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    // console.log(authorization);
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access' });
    }
    // bearer token
    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
    })
}


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.qe4grrt.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        client.connect();

        const usersCollection = client.db("speakUpSummers").collection("users");
        const classCollection = client.db("speakUpSummers").collection('classes');
        const selectedClassCollection = client.db("speakUpSummers").collection('selectedClasses');
        const paymentCollection = client.db("speakUpSummers").collection('payments');

        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ token })
        });


        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        };

        const verifyInstructor = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        };



        // users related apis
        app.get('/users', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        });

        // single entry in users database 
        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user?.email }
            const existingUser = await usersCollection.findOne(query);

            if (existingUser) {
                return res.send({ message: 'user already exists' })
            }

            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        // useAdmin hook 
        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ admin: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result);
        })

        // making admin 
        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        });



        // useInstructor hook 
        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;

            if (req.decoded.email !== email) {
                res.send({ instructor: false })
            }

            const query = { email: email }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result);
        })

        // making instructor 
        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };

            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result);

        })



        // classes APIs 
        // popular classes based on enrolled students
        app.get('/popular/classes', async (req, res) => {
            const classes = await classCollection.find({status: "approved"}).sort({ enrolled: -1 }).limit(6).toArray();
            res.send(classes);
        });

        // show all classes on page
        app.get('/classes', async (req, res) => {
            const classes = await classCollection.find({status: "approved"}).toArray();
            res.send(classes);
        });

        app.post('/classes', verifyJWT, verifyInstructor, async (req, res) => {
            const newItem = req.body;
            const result = await classCollection.insertOne(newItem)
            res.send(result);
        });


        //classes those added by the instructor 
        app.get('/my-classes', verifyJWT, verifyInstructor, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { instructorEmail: decodedEmail };
            const result = await classCollection.find(query).toArray();
            res.send(result);
        });





        // instructors APIs 
        // popular classes based on enrolled students
        app.get('/popular/instructors', async (req, res) => {
            const instructors = await classCollection.find({status: "approved"}).sort({ enrolled: -1 }).limit(6).toArray();
            res.send(instructors);
        });



        // selected classes APIs 
        app.get('/selectedClasses', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { email: email };
            const result = await selectedClassCollection.find(query).toArray();
            res.send(result);
        });


        app.post('/selectedClasses', async (req, res) => {
            const item = req.body;
            const result = await selectedClassCollection.insertOne(item);
            res.send(result);
        });


        app.delete('/selectedClasses/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await selectedClassCollection.deleteOne(query);
            res.send(result);
        })



        // enrolled classes APIs 
        app.get('/enrolledClasses', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }


            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const courses = await classCollection.find().toArray();
            const paidForCourses = await paymentCollection.find({ email: decodedEmail }).toArray();

            const enrolledCourseIds = paidForCourses.map(paidCourse => paidCourse.courseId);
            const enrolledCourses = courses.filter(course => enrolledCourseIds.includes(course._id.toString()));
            res.send(enrolledCourses);
        });






        // show all instructors on page
        app.get('/instructors', async (req, res) => {
            const instructors = await classCollection.find({status: "approved"}).toArray();
            res.send(instructors);
        });

        // handle status pending to approved 
        app.patch('/classes/approved/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'approved'
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);

        });

        // handle status pending to denied 
        app.patch('/classes/denied/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    status: 'denied'
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);

        });




        // -------------------
        // admin related apis
        // -------------------

        // get all classes that have to approve 
        app.get('/classes-added-by-instructors', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result);
        });


        // feedback by admin
        app.patch('/feedback/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const feedback = req.body.feedback;
            // console.log(feedback);
            const filter = { _id: new ObjectId(id) };
            const updateDoc = {
                $set: {
                    feedback: feedback
                },
            };

            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result);

        });





        // Payments related APIs 
        // create payment intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });

            res.send({
                clientSecret: paymentIntent.client_secret
            })
        });


        // payment related api
        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            const insertResult = await paymentCollection.insertOne(payment);

            const filter = { _id: new ObjectId(payment.cartId) };
            const deleteResult = await selectedClassCollection.deleteOne(filter);

            const query = { _id: new ObjectId(payment.courseId) };
            const course = await classCollection.findOne(query);


            if (course) {
                const updatedSeats = parseInt(course.availableSeats) - 1;
                const updateEnrolled = parseInt(course.enrolled) + 1;
            
                const updateResult = await classCollection.updateOne(query, {
                    $set: {
                        availableSeats: updatedSeats,
                        enrolled: updateEnrolled
                    }
                });
            
                console.log(updateResult);
            }

            res.send({ insertResult, deleteResult });
        });


        app.get('/payments-history', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const payments = await paymentCollection.find({ email: decodedEmail })
                .sort({ date: -1 })
                .toArray();

            res.send(payments);
        });






        // --------------------------------------
        // insert a chocolate to db 
        app.post('/upload-chocolate', async (req, res) => {
            const data = req.body;
            const result = await classCollection.insertOne(data);
            res.send(result);
        })


        // find a specific data from all data 
        app.get('/all-chocolate/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await classCollection.findOne(query);
            res.send(result);
        })

        // update data in db
        app.patch('/update-chocolate/:id', async (req, res) => {
            const id = req.params.id;
            const updatedChocolateData = req.body;
            const filter = { _id: new ObjectId(id) };
            // console.log(updatedChocolateData);

            const updatedDoc = {
                $set: {
                    name: updatedChocolateData.name,
                    image: updatedChocolateData.image,
                    country: updatedChocolateData.country,
                    category: updatedChocolateData.category,

                }
            }
            const result = await classCollection.updateOne(filter, updatedDoc);
            res.send(result);
        });

        // delete data in db 
        app.delete('/delete-chocolate/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const result = await classCollection.deleteOne(filter);
            res.send(result);
        })

        // -----------------------------

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('summer server is speaking');
})

app.listen(port, () => {
    console.log(`summer server is speaking on port ${port}`);
})