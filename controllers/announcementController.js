const Announcement = require('../models/Announcement');
const CommSettings = require('../models/CommSettings');

// ─── ID Generator ────────────────────────────────────────────────────────────

const generateAnnouncementNo = async (tenant_id) => {
    const last = await Announcement.findOne({ tenant_id }, { announcement_no: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.announcement_no) {
        const match = last.announcement_no.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `ANN-${String(nextNum).padStart(6, '0')}`;
};

// ─── createAnnouncement ───────────────────────────────────────────────────────

exports.createAnnouncement = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const {
            type,
            title,
            body,
            visibility,
            publish_immediately,
            scheduled_at,
            announcement_date,
            attachments,
            source,
            source_module,
            source_record_id,
            template_id,
            field_values,
        } = req.body;

        const resolvedType = type || source_module || 'General';

        if (!title) return res.status(400).json({ message: 'Title is required' });
        if (!body) return res.status(400).json({ message: 'Body is required' });

        const announcement_no = await generateAnnouncementNo(tenant_id);

        const status = publish_immediately ? 'published' : 'draft';
        const published_at = publish_immediately ? new Date() : null;

        const record = await Announcement.create({
            tenant_id,
            announcement_no,
            type: resolvedType,
            title,
            body,
            status,
            visibility: visibility || 'members_only',
            publish_immediately: !!publish_immediately,
            scheduled_at: scheduled_at || null,
            published_at,
            announcement_date: announcement_date || null,
            attachments: attachments || [],
            source: source || 'standalone',
            source_module: source_module || null,
            source_record_id: source_record_id || null,
            template_id: template_id || null,
            field_values: field_values || null,
            created_by,
        });

        const populated = await Announcement.findById(record._id)
            .populate('created_by', 'name email')
            .lean();

        return res.status(201).json({ message: 'Announcement created successfully', record: populated });
    } catch (err) {
        console.error('createAnnouncement error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getAnnouncements ────────────────────────────────────────────────────────

exports.getAnnouncements = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const {
            page = 1,
            limit = 20,
            search = '',
            status,
            type,
        } = req.query;

        const query = { tenant_id, is_archived: false };

        if (status) query.status = status;
        if (type) query.type = type;

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } },
                { announcement_no: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            Announcement.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('created_by', 'name')
                .lean(),
            Announcement.countDocuments(query),
        ]);

        const pages = Math.ceil(total / Number(limit));

        return res.json({ records, total, page: Number(page), pages });
    } catch (err) {
        console.error('getAnnouncements error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getAnnouncementById ─────────────────────────────────────────────────────

exports.getAnnouncementById = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await Announcement.findOne({ _id: req.params.id, tenant_id })
            .populate('created_by', 'name email')
            .lean();

        if (!record) return res.status(404).json({ message: 'Announcement not found' });

        return res.json({ record });
    } catch (err) {
        console.error('getAnnouncementById error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── updateAnnouncement ───────────────────────────────────────────────────────

exports.updateAnnouncement = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await Announcement.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Announcement not found' });

        const { type, title, body, visibility, scheduled_at, announcement_date, attachments } = req.body;

        const updates = {};
        if (type !== undefined) updates.type = type;
        if (title !== undefined) updates.title = title;
        if (body !== undefined) updates.body = body;
        if (visibility !== undefined) updates.visibility = visibility;
        if (scheduled_at !== undefined) updates.scheduled_at = scheduled_at || null;
        if (announcement_date !== undefined) updates.announcement_date = announcement_date || null;
        if (attachments !== undefined) updates.attachments = attachments;

        const updated = await Announcement.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        )
            .populate('created_by', 'name email')
            .lean();

        return res.json({ message: 'Announcement updated successfully', record: updated });
    } catch (err) {
        console.error('updateAnnouncement error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── publishAnnouncement ──────────────────────────────────────────────────────

exports.publishAnnouncement = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await Announcement.findOneAndUpdate(
            { _id: req.params.id, tenant_id },
            { $set: { status: 'published', published_at: new Date() } },
            { new: true }
        )
            .populate('created_by', 'name email')
            .lean();

        if (!record) return res.status(404).json({ message: 'Announcement not found' });

        return res.json({ message: 'Announcement published successfully', record });
    } catch (err) {
        console.error('publishAnnouncement error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── deleteAnnouncement ───────────────────────────────────────────────────────

exports.deleteAnnouncement = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await Announcement.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Announcement not found' });

        await Announcement.findByIdAndDelete(req.params.id);

        return res.json({ message: 'Announcement deleted successfully' });
    } catch (err) {
        console.error('deleteAnnouncement error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getPublished ─────────────────────────────────────────────────────────────

exports.getPublished = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { page = 1, limit = 20, search = '' } = req.query;

        const query = { tenant_id, status: 'published', is_archived: false };

        if (search) {
            query.$or = [
                { title: { $regex: search, $options: 'i' } },
                { type: { $regex: search, $options: 'i' } },
                { announcement_no: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            Announcement.find(query)
                .sort({ published_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('created_by', 'name')
                .lean(),
            Announcement.countDocuments(query),
        ]);

        return res.json({ records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('getPublished error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── Comm Settings ────────────────────────────────────────────────────────────

exports.getCommSettings = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        let settings = await CommSettings.findOne({ tenant_id }).lean();

        if (!settings) {
            settings = await CommSettings.create({ tenant_id });
        }

        return res.json({ settings });
    } catch (err) {
        console.error('getCommSettings error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

exports.updateCommSettings = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { organization_name, signature, announcement_types } = req.body;

        const updates = {};
        if (organization_name !== undefined) updates.organization_name = organization_name;
        if (signature !== undefined) updates.signature = signature;
        if (announcement_types !== undefined) updates.announcement_types = announcement_types;

        const settings = await CommSettings.findOneAndUpdate(
            { tenant_id },
            { $set: updates },
            { new: true, upsert: true }
        ).lean();

        return res.json({ message: 'Settings updated successfully', settings });
    } catch (err) {
        console.error('updateCommSettings error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
