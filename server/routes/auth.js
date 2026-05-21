import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User.js';
import nodemailer from 'nodemailer';

const router = Router();

/**
 * POST /api/auth/login
 * Validates email + password against MongoDB.
 * Returns the user (without passwordHash) if credentials are correct.
 */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() }).lean();

        if (!user) {
            return res.status(401).json({ error: 'User not found.' });
        }

        // If the user has no password yet, accept any password >= 4 chars
        // (migration mode: allows setting a password for the first time)
        let isValid = false;
        if (!user.passwordHash) {
            isValid = password.length >= 4;
        } else {
            isValid = await bcrypt.compare(password, user.passwordHash);
        }

        if (!isValid) {
            return res.status(401).json({ error: 'Incorrect password.' });
        }

        // Return user without sensitive fields
        const { _id, __v, createdAt, updatedAt, passwordHash, ...safeUser } = user;

        // Ensure canApproveCosting is set correctly (admin users can approve)
        if (safeUser.canApproveCosting === undefined || safeUser.canApproveCosting === null) {
            safeUser.canApproveCosting = safeUser.role === 'admin';
        }

        // Admin role always gets full permissions regardless of what's stored in DB
        if (safeUser.role === 'admin') {
            safeUser.permissions = {
                ...(safeUser.permissions || {}),
                admin: true,
                dashboard: true,
                crm: true,
                projects: true,
            };
        }

        // Persist user in server-side session
        req.session.user = safeUser;

        res.json(safeUser);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * GET /api/auth/me
 * Returns the current session user (used on page reload to restore auth state).
 */
router.get('/me', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'Not authenticated.' });

    const user = req.session.user;
    // Ensure canApproveCosting is set correctly (admin users can approve)
    if (user.canApproveCosting === undefined || user.canApproveCosting === null) {
        user.canApproveCosting = user.role === 'admin';
    }

    res.json(user);
});

/**
 * POST /api/auth/logout
 * Destroys the session and clears the cookie.
 */
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: 'Could not log out.' });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

/**
 * POST /api/auth/set-password
 * Sets or changes a user's password (requires id + newPassword).
 */
router.post('/set-password', async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword || newPassword.length < 4) {
        return res.status(400).json({ error: 'userId and password (min. 4 chars) are required.' });
    }

    try {
        const passwordHash = await bcrypt.hash(newPassword, 10);
        const result = await User.findOneAndUpdate(
            { id: userId },
            { $set: { passwordHash } },
            { new: true }
        );

        if (!result) return res.status(404).json({ error: 'User not found.' });

        res.json({ success: true, message: 'Password updated successfully.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/auth/forgot-password
 * Generates a reset token and emails it. Always returns 200 to avoid user enumeration.
 */
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    try {
        const user = await User.findOne({ email: email.toLowerCase().trim() });
        if (user) {
            const token = crypto.randomBytes(32).toString('hex');
            user.resetPasswordToken = token;
            user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM, APP_URL } = process.env;
            if (SMTP_USER && SMTP_PASSWORD) {
                const transporter = nodemailer.createTransport({
                    host: SMTP_HOST || 'smtp.gmail.com',
                    port: Number(SMTP_PORT || 587),
                    secure: Number(SMTP_PORT) === 465,
                    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
                });
                const resetUrl = `${APP_URL || 'http://localhost:5173'}/#/reset-password/${token}`;
                await transporter.sendMail({
                    from: SMTP_FROM || SMTP_USER,
                    to: user.email,
                    subject: 'CRM Blackmoon — Password Reset',
                    html: `<p>Hi ${user.name},</p>
                           <p>Click the link below to reset your password. It expires in 1 hour.</p>
                           <p><a href="${resetUrl}">${resetUrl}</a></p>
                           <p>If you did not request this, ignore this email.</p>`,
                }).catch(e => console.error('[Auth] reset email failed:', e.message));
            }
        }
        // Always 200 — don't reveal whether email exists
        res.json({ message: 'If that email is registered, a reset link has been sent.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * POST /api/auth/reset-password
 * Validates token and sets new password.
 */
router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password || password.length < 4) {
        return res.status(400).json({ error: 'Token and password (min. 4 chars) are required.' });
    }

    try {
        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: new Date() },
        });
        if (!user) return res.status(400).json({ error: 'Reset token is invalid or has expired.' });

        user.passwordHash = await bcrypt.hash(password, 10);
        user.resetPasswordToken = null;
        user.resetPasswordExpires = null;
        await user.save();

        res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
