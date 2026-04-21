const router = require("express").Router();
const auth = require("../middleware/auth");
const {
    createHadiyaCollection,
    getHadiyaCollections,
    getHadiyaCollectionById,
    updateHadiyaCollection,
    deleteHadiyaCollection,
    getHadiyaSummary,
    searchHouses
} = require("../controllers/hadiyaController");

// ==================== HADIYA COLLECTION ROUTES ====================

// Create hadiya collection
router.post("/create", auth, createHadiyaCollection);

// Get all hadiya collections
router.get("/", auth, getHadiyaCollections);

// Get hadiya summary
router.get("/summary", auth, getHadiyaSummary);

// Get hadiya collection by ID
router.get("/:id", auth, getHadiyaCollectionById);

// Update hadiya collection
router.put("/:id", auth, updateHadiyaCollection);

// Delete hadiya collection (soft delete)
router.delete("/:id", auth, deleteHadiyaCollection);

// ==================== HOUSE SEARCH ROUTE ====================

// Smart search houses for hadiya collection
router.get("/houses/search", auth, searchHouses);

module.exports = router;
