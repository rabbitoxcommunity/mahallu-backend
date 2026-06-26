const AnnouncementTemplate = require('../models/AnnouncementTemplate');

// ─── createTemplate ───────────────────────────────────────────────────────────

exports.createTemplate = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const { template_name, module: mod, category, message, dynamic_fields, variables, is_active } = req.body;

        if (!template_name) return res.status(400).json({ message: 'Template name is required' });
        if (!message) return res.status(400).json({ message: 'Message is required' });

        // derive variables from dynamic_fields keys for backward compat
        const derivedVars = Array.isArray(dynamic_fields)
            ? dynamic_fields.map(f => `{{${f.key}}}`)
            : (variables || []);

        const record = await AnnouncementTemplate.create({
            tenant_id,
            template_name,
            module: mod || 'general',
            category: category || mod || 'general',
            message,
            dynamic_fields: Array.isArray(dynamic_fields)
                ? dynamic_fields.map((f, i) => ({ ...f, order: f.order ?? i }))
                : [],
            variables: derivedVars,
            is_active: is_active !== false,
            created_by,
        });

        const populated = await AnnouncementTemplate.findById(record._id)
            .populate('created_by', 'name email')
            .lean();

        return res.status(201).json({ message: 'Template created successfully', record: populated });
    } catch (err) {
        console.error('createTemplate error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getTemplates ─────────────────────────────────────────────────────────────

exports.getTemplates = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const { page = 1, limit = 50, search = '', category, module: mod } = req.query;

        const query = { tenant_id };
        if (mod) query.module = mod;
        else if (category) query.category = category;

        if (search) {
            query.$or = [
                { template_name: { $regex: search, $options: 'i' } },
                { category: { $regex: search, $options: 'i' } },
                { module: { $regex: search, $options: 'i' } },
            ];
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            AnnouncementTemplate.find(query)
                .sort({ created_at: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('created_by', 'name')
                .lean(),
            AnnouncementTemplate.countDocuments(query),
        ]);

        return res.json({ records, total, page: Number(page), pages: Math.ceil(total / Number(limit)) });
    } catch (err) {
        console.error('getTemplates error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getTemplateById ──────────────────────────────────────────────────────────

exports.getTemplateById = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await AnnouncementTemplate.findOne({ _id: req.params.id, tenant_id })
            .populate('created_by', 'name email')
            .lean();

        if (!record) return res.status(404).json({ message: 'Template not found' });

        return res.json({ record });
    } catch (err) {
        console.error('getTemplateById error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── updateTemplate ───────────────────────────────────────────────────────────

exports.updateTemplate = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await AnnouncementTemplate.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Template not found' });

        const { template_name, module: mod, category, message, dynamic_fields, variables, is_active } = req.body;

        const updates = {};
        if (template_name !== undefined) updates.template_name = template_name;
        if (mod !== undefined) { updates.module = mod; updates.category = category || mod; }
        if (category !== undefined && mod === undefined) updates.category = category;
        if (message !== undefined) updates.message = message;
        if (is_active !== undefined) updates.is_active = is_active;

        if (dynamic_fields !== undefined) {
            updates.dynamic_fields = Array.isArray(dynamic_fields)
                ? dynamic_fields.map((f, i) => ({ ...f, order: f.order ?? i }))
                : [];
            updates.variables = updates.dynamic_fields.map(f => `{{${f.key}}}`);
        } else if (variables !== undefined) {
            updates.variables = variables;
        }

        const updated = await AnnouncementTemplate.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        )
            .populate('created_by', 'name email')
            .lean();

        return res.json({ message: 'Template updated successfully', record: updated });
    } catch (err) {
        console.error('updateTemplate error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── deleteTemplate ───────────────────────────────────────────────────────────

exports.deleteTemplate = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await AnnouncementTemplate.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Template not found' });

        await AnnouncementTemplate.findByIdAndDelete(req.params.id);

        return res.json({ message: 'Template deleted successfully' });
    } catch (err) {
        console.error('deleteTemplate error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};
