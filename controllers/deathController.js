const DeathRegistry = require('../models/DeathRegistry');
const Member = require('../models/Member');
const DirectIncome = require('../models/DirectIncome');
const Tenant = require('../models/Tenant');
const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');
const path = require('path');

// ─── ID Generators ──────────────────────────────────────────────────────────

const generateDeathId = async (tenant_id) => {
    const last = await DeathRegistry.findOne({ tenant_id }, { death_id: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.death_id) {
        const match = last.death_id.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `DTH-${String(nextNum).padStart(6, '0')}`;
};

const generateCertificateNo = async (tenant_id) => {
    const last = await DeathRegistry.findOne({ tenant_id }, { certificate_no: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.certificate_no) {
        const match = last.certificate_no.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `DCERT-${String(nextNum).padStart(6, '0')}`;
};

const generateIncomeCode = async (tenant_id) => {
    const last = await DirectIncome.findOne({ tenant_id }, { income_code: 1 })
        .sort({ created_at: -1 })
        .lean();

    let nextNum = 1;
    if (last && last.income_code) {
        const match = last.income_code.match(/\d+$/);
        if (match) nextNum = parseInt(match[0], 10) + 1;
    }

    return `INC-${String(nextNum).padStart(4, '0')}`;
};

// ─── Calculate Age ───────────────────────────────────────────────────────────

const calculateAge = (dob, dateOfDeath) => {
    if (!dob || !dateOfDeath) return null;
    const birth = new Date(dob);
    const death = new Date(dateOfDeath);
    let age = death.getFullYear() - birth.getFullYear();
    const monthDiff = death.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && death.getDate() < birth.getDate())) {
        age--;
    }
    return age >= 0 ? age : null;
};

// ─── createDeathRecord ───────────────────────────────────────────────────────

exports.createDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const created_by = req.user.id;

        const {
            is_registered_member,
            member_id,
            house_id,
            name,
            gender,
            dob,
            father_name,
            mother_name,
            spouse_name,
            primary_contact,
            date_of_death,
            time_of_death,
            place_of_death,
            cause_of_death,
            hospital,
            janaza_date,
            janaza_time,
            janaza_place,
            imam,
            charge_applicable,
            charge_amount,
            payment_status,
            payment_method,
            notes,
        } = req.body;

        if (!name) return res.status(400).json({ message: 'Name is required' });
        if (!date_of_death) return res.status(400).json({ message: 'Date of death is required' });

        const age = calculateAge(dob, date_of_death);

        const death_id = await generateDeathId(tenant_id);
        const certificate_no = await generateCertificateNo(tenant_id);

        const record = await DeathRegistry.create({
            tenant_id,
            death_id,
            certificate_no,
            is_registered_member: !!is_registered_member,
            member_id: is_registered_member && member_id ? member_id : null,
            house_id: house_id || null,
            name,
            gender,
            dob: dob || null,
            age,
            father_name,
            mother_name,
            spouse_name,
            primary_contact,
            date_of_death,
            time_of_death,
            place_of_death,
            cause_of_death,
            hospital,
            janaza_date: janaza_date || null,
            janaza_time,
            janaza_place,
            imam,
            charge_applicable: !!charge_applicable,
            charge_amount: charge_applicable ? (Number(charge_amount) || 0) : 0,
            payment_status: charge_applicable ? (payment_status || 'pending') : 'pending',
            payment_method: charge_applicable ? (payment_method || 'cash') : undefined,
            notes,
            created_by,
        });

        // Update member if registered
        if (is_registered_member && member_id) {
            await Member.findByIdAndUpdate(member_id, {
                is_deceased: true,
                date_of_death: new Date(date_of_death),
                death_registry_id: record._id,
            });
        }

        // Create income entry if charge applicable
        if (charge_applicable && Number(charge_amount) > 0) {
            const income_code = await generateIncomeCode(tenant_id);
            const income = await DirectIncome.create({
                tenant_id,
                income_code,
                category: 'Burial & Janaza Charges',
                source_name: name,
                amount: Number(charge_amount),
                date: new Date(date_of_death),
                payment_method: payment_method || 'cash',
                receipt_no: death_id,
                description: `Death registry charge for ${name} (${death_id})`,
                created_by,
            });

            await DeathRegistry.findByIdAndUpdate(record._id, {
                income_transaction_id: income._id,
            });
            record.income_transaction_id = income._id;
        }

        const populated = await DeathRegistry.findById(record._id)
            .populate('house_id', 'house_code householder_name primary_contact')
            .populate('member_id', 'full_name contact_number whatsapp')
            .populate('created_by', 'name email')
            .lean();

        return res.status(201).json({ message: 'Death record created successfully', record: populated });
    } catch (err) {
        console.error('createDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getDeathRecords ─────────────────────────────────────────────────────────

exports.getDeathRecords = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const {
            page = 1,
            limit = 20,
            search = '',
            gender,
            from_date,
            to_date,
        } = req.query;

        const query = { tenant_id, is_active: true };

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { death_id: { $regex: search, $options: 'i' } },
                { certificate_no: { $regex: search, $options: 'i' } },
                { primary_contact: { $regex: search, $options: 'i' } },
            ];
        }

        if (gender) query.gender = gender;

        if (from_date || to_date) {
            query.date_of_death = {};
            if (from_date) query.date_of_death.$gte = new Date(from_date);
            if (to_date) {
                const to = new Date(to_date);
                to.setHours(23, 59, 59, 999);
                query.date_of_death.$lte = to;
            }
        }

        const skip = (Number(page) - 1) * Number(limit);
        const [records, total] = await Promise.all([
            DeathRegistry.find(query)
                .sort({ date_of_death: -1 })
                .skip(skip)
                .limit(Number(limit))
                .populate('house_id', 'house_code householder_name')
                .populate('member_id', 'full_name')
                .populate('created_by', 'name')
                .lean(),
            DeathRegistry.countDocuments(query),
        ]);

        const pages = Math.ceil(total / Number(limit));

        return res.json({ records, total, page: Number(page), pages });
    } catch (err) {
        console.error('getDeathRecords error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── getDeathById ────────────────────────────────────────────────────────────

exports.getDeathById = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id })
            .populate('house_id', 'house_code householder_name primary_contact address')
            .populate('member_id', 'full_name contact_number whatsapp gender dob')
            .populate('income_transaction_id', 'income_code amount payment_method receipt_no')
            .populate('created_by', 'name email')
            .lean();

        if (!record) return res.status(404).json({ message: 'Record not found' });

        return res.json({ record });
    } catch (err) {
        console.error('getDeathById error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── updateDeathRecord ───────────────────────────────────────────────────────

exports.updateDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Record not found' });

        const allowedFields = [
            'place_of_death',
            'cause_of_death',
            'hospital',
            'janaza_date',
            'janaza_time',
            'janaza_place',
            'imam',
            'notes',
            'payment_status',
            'payment_method',
            'time_of_death',
        ];

        const updates = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) updates[field] = req.body[field];
        }

        // If date_of_death changes, update member too
        if (req.body.date_of_death && req.body.date_of_death !== String(record.date_of_death)) {
            updates.date_of_death = new Date(req.body.date_of_death);
            if (record.member_id) {
                await Member.findByIdAndUpdate(record.member_id, {
                    date_of_death: updates.date_of_death,
                });
            }
        }

        const updated = await DeathRegistry.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true }
        )
            .populate('house_id', 'house_code householder_name primary_contact')
            .populate('member_id', 'full_name')
            .populate('created_by', 'name')
            .lean();

        return res.json({ message: 'Death record updated successfully', record: updated });
    } catch (err) {
        console.error('updateDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── deleteDeathRecord ───────────────────────────────────────────────────────

exports.deleteDeathRecord = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOne({ _id: req.params.id, tenant_id });

        if (!record) return res.status(404).json({ message: 'Record not found' });

        // Soft delete
        record.is_active = false;
        await record.save();

        // Revert member status if linked
        if (record.member_id) {
            await Member.findByIdAndUpdate(record.member_id, {
                is_deceased: false,
                date_of_death: null,
                death_registry_id: null,
            });
        }

        return res.json({ message: 'Death record deleted successfully' });
    } catch (err) {
        console.error('deleteDeathRecord error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── markCertificateGenerated ────────────────────────────────────────────────

exports.markCertificateGenerated = async (req, res) => {
    try {
        const tenant_id = req.user.tenant_id;
        const record = await DeathRegistry.findOneAndUpdate(
            { _id: req.params.id, tenant_id },
            { $set: { certificate_generated: true } },
            { new: true }
        ).lean();

        if (!record) return res.status(404).json({ message: 'Record not found' });

        return res.json({ message: 'Certificate marked as generated', record });
    } catch (err) {
        console.error('markCertificateGenerated error:', err);
        return res.status(500).json({ message: 'Server error', error: err.message });
    }
};

// ─── generateDeathCertPDF ────────────────────────────────────────────────────

const fmtDate = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

const fmtDateLong = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '-';

const wrapText = (str, maxWidth, size, f) => {
    if (!str || str === '-') return [str || '-'];
    const words = String(str).split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
        if (!w) continue;
        const test = line ? `${line} ${w}` : w;
        if (f.widthOfTextAtSize(test, size) > maxWidth && line) {
            lines.push(line);
            line = w;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : ['-'];
};

const generateDeathCertPDF = async (record) => {
    const tenant = await Tenant.findById(record.tenant_id).select('name');
    const mahalluName = tenant?.name || 'Mahallu';

    const v = (x) => (x ? String(x) : '-');

    const iDate = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);

    const page = pdfDoc.addPage([595.276, 841.89]); // A4
    const { width, height } = page.getSize();

    // ── Fonts ──
    const sysF   = '/System/Library/Fonts/Supplemental';
    const fReg   = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia.ttf`));
    const fBold  = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Bold.ttf`));
    const fItal  = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Italic.ttf`));
    const fBoldI = await pdfDoc.embedFont(fs.readFileSync(`${sysF}/Georgia Bold Italic.ttf`));

    // ── Colours ──
    const cBlack  = rgb(0.08, 0.08, 0.08);
    const cDark   = rgb(0.15, 0.25, 0.15);   // deep green — funeral/solemn
    const cGray   = rgb(0.38, 0.38, 0.38);
    const cAccent = rgb(0.30, 0.45, 0.30);

    const L  = 80;
    const R  = width - 80;
    const CW = R - L;

    const tx = (str, x, y, size, f = fReg, color = cBlack) =>
        page.drawText(String(str || '-'), { x, y, size, font: f, color });

    const ctrX = (str, size, f = fReg) =>
        (width - f.widthOfTextAtSize(str, size)) / 2;

    const hLine = (y, x1 = L, x2 = R, t = 0.6, color = cAccent) =>
        page.drawLine({ start: { x: x1, y }, end: { x: x2, y }, thickness: t, color });

    // ── Outer border ──
    page.drawRectangle({ x: L - 20, y: 50, width: CW + 40, height: height - 100, borderColor: cDark, borderWidth: 1.5, opacity: 0 });
    page.drawRectangle({ x: L - 16, y: 54, width: CW + 32, height: height - 108, borderColor: cAccent, borderWidth: 0.4, opacity: 0 });

    // ════════════ HEADER ════════════
    const orgStr = mahalluName.toUpperCase();
    const orgFS  = 14;
    const orgW   = fBold.widthOfTextAtSize(orgStr, orgFS);
    const orgX   = (width - orgW) / 2;
    const orgY   = height - 80;

    // flanking lines
    const lineY = orgY + 6;
    hLine(lineY,     L, orgX - 12, 1.2, cDark);
    hLine(lineY - 3, L, orgX - 12, 0.4, cAccent);
    page.drawEllipse({ x: orgX - 7, y: lineY - 1.5, xScale: 3.5, yScale: 3.5, color: cDark });
    tx(orgStr, orgX, orgY, orgFS, fBold, cDark);
    hLine(lineY,     orgX + orgW + 12, R, 1.2, cDark);
    hLine(lineY - 3, orgX + orgW + 12, R, 0.4, cAccent);
    page.drawEllipse({ x: orgX + orgW + 7, y: lineY - 1.5, xScale: 3.5, yScale: 3.5, color: cDark });
    hLine(orgY - 2, orgX + 4, orgX + orgW - 4, 0.4, cAccent);

    // Title
    const titleStr = 'Certificate of Death';
    const titleW   = fBoldI.widthOfTextAtSize(titleStr, 13);
    const titleX   = (width - titleW) / 2;
    const titleY   = orgY - 25;
    tx(titleStr, titleX, titleY, 13, fBoldI, cBlack);
    hLine(titleY - 3, titleX, titleX + titleW, 1.0, cBlack);
    hLine(titleY - 6, titleX + 12, titleX + titleW - 12, 0.4, cGray);

    // ════════════ CERT INFO BAR ════════════
    const barH   = 18;
    const barBot = titleY - 32;
    const barTop = barBot + barH;
    page.drawRectangle({ x: L, y: barBot, width: CW, height: barH, color: rgb(0.93, 0.96, 0.93) });
    hLine(barTop, L, R, 1.2, cDark);
    hLine(barBot, L, R, 0.6, cDark);
    page.drawLine({ start: { x: width / 2, y: barBot + 2 }, end: { x: width / 2, y: barTop - 2 }, thickness: 0.5, color: cAccent });
    tx(`No. ${v(record.certificate_no)}`, L + 7, barBot + 5, 8, fBold, cDark);
    const idStr = `Date of Issue : ${iDate}`;
    tx(idStr, R - fBold.widthOfTextAtSize(idStr, 8) - 7, barBot + 5, 8, fBold, cDark);

    // Subtitle
    const sub = `This is to certify that the death of the following individual has been registered in the Death Register maintained by ${mahalluName}.`;
    const subLines = wrapText(sub, CW, 7.5, fItal);
    const subY0 = barBot - 14;
    subLines.forEach((ln, i) => tx(ln, ctrX(ln, 7.5, fItal), subY0 - i * 10, 7.5, fItal, cGray));

    // Divider
    const divY = subY0 - subLines.length * 10 - 8;
    hLine(divY + 4, L,     R,     0.4, cAccent);
    hLine(divY,     L + 8, R - 8, 1.8, cDark);
    hLine(divY - 4, L,     R,     0.4, cAccent);

    // ════════════ DECEASED DETAILS ════════════
    let cy = divY - 20;

    const KW  = 130;
    const FS  = 8.5;
    const ROW = 14;
    const LH  = 11;

    const kv = (key, val) => {
        tx(key, L, cy, FS, fBold, cGray);
        tx(':', L + KW, cy, FS, fBold, cGray);
        const valX = L + KW + 9;
        const valW = R - valX;
        const lines = wrapText(String(val || '-'), valW, FS, fReg);
        lines.forEach((ln, i) => tx(ln, valX, cy - i * LH, FS, fReg, cBlack));
        cy -= ROW + (lines.length - 1) * LH;
    };

    const sectionHead = (title) => {
        cy -= 6;
        const tw  = fBold.widthOfTextAtSize(title, 10);
        const mid = width / 2;
        tx(title, mid - tw / 2, cy, 10, fBold, cDark);
        hLine(cy + 4, L, mid - tw / 2 - 6, 0.7, cDark);
        hLine(cy + 4, mid + tw / 2 + 6, R, 0.7, cDark);
        cy -= 18;
    };

    sectionHead('Personal Information');
    kv('Full Name',           v(record.name));
    kv('Gender',              v(record.gender));
    if (record.dob) kv('Date of Birth', fmtDateLong(record.dob));
    kv('Age at Death',        record.age != null ? `${record.age} years` : '-');
    if (record.father_name) kv('Father\'s Name', v(record.father_name));
    if (record.mother_name) kv('Mother\'s Name', v(record.mother_name));
    if (record.spouse_name) kv('Spouse\'s Name', v(record.spouse_name));

    hLine(cy - 6, L, R, 0.7, cAccent);

    cy -= 18;
    sectionHead('Death Information');
    kv('Date of Death',    fmtDateLong(record.date_of_death));
    if (record.time_of_death)  kv('Time of Death',    v(record.time_of_death));
    if (record.place_of_death) kv('Place of Death',   v(record.place_of_death));
    if (record.cause_of_death) kv('Cause of Death',   v(record.cause_of_death));
    if (record.hospital)       kv('Hospital',         v(record.hospital));
    if (record.janaza_date)    kv('Janaza Date',       fmtDate(record.janaza_date));
    if (record.janaza_time)    kv('Janaza Time',       v(record.janaza_time));

    hLine(cy - 6, L, R, 0.5, cAccent);
    cy -= 12;
    tx(`Death ID : ${v(record.death_id)}`, L, cy, 7.5, fReg, cGray);
    const cnStr = `Certificate No : ${v(record.certificate_no)}`;
    tx(cnStr, R - fReg.widthOfTextAtSize(cnStr, 7.5), cy, 7.5, fReg, cGray);

    // ════════════ SIGNATURE ════════════
    const sigY = cy - 55;
    const sealLbl = '[ Seal ]';
    const sealLblW = fItal.widthOfTextAtSize(sealLbl, 7);
    tx(sealLbl, L + 58 - sealLblW / 2, sigY - 32, 7, fItal, rgb(0.75, 0.75, 0.75));

    const sigX1 = R - 150;
    hLine(sigY, sigX1, R, 0.8, cBlack);
    const slbl = 'Authorized Signatory';
    tx(slbl, sigX1 + (150 - fBold.widthOfTextAtSize(slbl, 8)) / 2, sigY - 11, 8, fBold, cBlack);
    tx(mahalluName, sigX1 + (150 - fReg.widthOfTextAtSize(mahalluName, 7.5)) / 2, sigY - 22, 7.5, fReg, cGray);

    const disc = `This is an official certificate issued by ${mahalluName}. Valid for all official purposes.`;
    tx(disc, ctrX(disc, 6.5, fItal), sigY - 44, 6.5, fItal, rgb(0.55, 0.55, 0.55));

    // ════════════ SAVE ════════════
    const pdfDir = path.join(__dirname, '../public/certificates');
    if (!fs.existsSync(pdfDir)) fs.mkdirSync(pdfDir, { recursive: true });
    const pdfBytes = await pdfDoc.save();
    const certNo = record.certificate_no || record.death_id;
    fs.writeFileSync(path.join(pdfDir, `${certNo}.pdf`), pdfBytes);
    return certNo;
};

exports.generateDeathCertPDF = generateDeathCertPDF;
