const functions = require("firebase-functions");
const admin = require("firebase-admin");
const algoliasearch = require("algoliasearch");

// Set up Firestore.
admin.initializeApp();
const db = admin.firestore();

// Set up Algolia.
// The app id and API key are coming from the cloud functions environment, as we set up in Part 1, Step 3.
const algoliaClient = algoliasearch(
  functions.config().algolia.appid,
  functions.config().algolia.apikey
);
// Since I'm using develop and production environments, I'm automatically defining
// the index name according to which environment is running. functions.config().projectId is a default
// property set by Cloud Functions.
const collectionIndex = algoliaClient.initIndex("jobs");

// Create a HTTP request cloud function.
exports.sendCollectionToAlgolia = functions.https.onRequest(
  async (req, res) => {
    // This array will contain all records to be indexed in Algolia.
    // A record does not need to necessarily contain all properties of the Firestore document,
    // only the relevant ones.
    const algoliaRecords = [];

    // Retrieve all documents from the COLLECTION collection.
    const querySnapshot = await db.collection("jobs").get();

    querySnapshot.docs.forEach((doc) => {
      const document = doc.data();
      // Essentially, you want your records to contain any information that facilitates search,
      // display, filtering, or relevance. Otherwise, you can leave it out.
      const record = {
        objectID: doc.id,
        ...document
      };

      algoliaRecords.push(record);
    });

    // After all records are created, we save them to
    collectionIndex.saveObjects(algoliaRecords, (_error, content) => {
      res.status(200).send("COLLECTION was indexed to Algolia successfully.");
    });
  }
);

async function saveDocumentInAlgolia(snapshot) {
  if (snapshot.exists) {
    const record = snapshot.data();
    if (record) {
      // Removes the possibility of snapshot.data() being undefined.
      // NOTICE!
      // Please notice: isIncomplete is a custom property
      // I'm using to control which documents should be indexed by Algolia.
      // You will not find it in any documention, and can remove in your implementation.
      if (!record.isIncomplete) {
        // We only index products that are complete.
        record.objectID = snapshot.id;

        // In this example, we are including all properties of the Firestore document
        // in the Algolia record, but do remember to evaluate if they are all necessary.
        // More on that in Part 2, Step 2 above.

        await collectionIndex.saveObject(record); // Adds or replaces a specific object.
      }
    }
  }
}

async function updateDocumentInAlgolia(change) {
  const docBeforeChange = change.before.data();
  const docAfterChange = change.after.data();
  if (docBeforeChange && docAfterChange) {
    // PLEASE NOTICE!
    // isIncomplete is a custom property that
    // I'm using to control which documents should be indexed by Algolia.
    // You will not find it in any documention, and you can remove in your implementation.
    if (docAfterChange.isIncomplete && !docBeforeChange.isIncomplete) {
      // If the doc was COMPLETE and is now INCOMPLETE, it was
      // previously indexed in algolia and must now be removed.
      await deleteDocumentFromAlgolia(change.after);
    } else if (!docAfterChange.isIncomplete) {
      await saveDocumentInAlgolia(change.after);
    }
  }
}

async function deleteDocumentFromAlgolia(snapshot) {
  if (snapshot.exists) {
    const objectID = snapshot.id;
    await collectionIndex.deleteObject(objectID);
  }
}

exports.collectionOnCreate = functions.firestore
  .document("jobs/{objectID}")
  .onCreate(async (snapshot, context) => {
    console.log('running into onCreate')
    await saveDocumentInAlgolia(snapshot);
  });

exports.collectionOnUpdate = functions.firestore
  .document("jobs/{objectID}")
  .onUpdate(async (change, context) => {
    await updateDocumentInAlgolia(change);
  });

exports.collectionOnDelete = functions.firestore
  .document("jobs/{objectID}")
  .onDelete(async (snapshot, context) => {
    console.log('running into onDelete')
    await deleteDocumentFromAlgolia(snapshot);
  });
