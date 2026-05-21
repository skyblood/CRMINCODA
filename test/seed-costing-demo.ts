/**
 * Costing System Seed Data
 * ─────────────────────────────────────────────────────────────────────────
 * Generates demo leads and users for testing the costing system.
 *
 * Usage:
 *   npx ts-node test/seed-costing-demo.ts
 *   Or run directly if MongoDB is connected:
 *   node -r esbuild-register test/seed-costing-demo.ts
 */

import type { Lead, User } from '../types';

const API_URL = 'http://localhost:3001/api';

interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'sales' | 'consultant';
}

interface DemoLead {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  stage: 'proposal';
  items: Array<{
    id: string;
    name: string;
    price: number;
    category: string;
    baseCost?: number;
    costStatus?: 'pending' | 'reviewed' | 'approved';
  }>;
}

const DEMO_USERS: DemoUser[] = [
  {
    id: 'demo_admin_finance',
    name: 'Alice Chen - Finance',
    email: 'alice.chen@demo.example.com',
    role: 'admin',
  },
  {
    id: 'demo_sales_manager',
    name: 'Bob Martinez - Sales',
    email: 'bob.martinez@demo.example.com',
    role: 'sales',
  },
  {
    id: 'demo_consultant_senior',
    name: 'Carol Smith - Senior Consultant',
    email: 'carol.smith@demo.example.com',
    role: 'consultant',
  },
];

const DEMO_LEADS: DemoLead[] = [
  // SCENARIO 1: Under-Budget (40% Margin) — HEALTHY
  {
    id: 'demo_lead_under_budget',
    companyName: 'Acme Corporation',
    contactName: 'John Henderson',
    email: 'john.henderson@acmecorp.com',
    stage: 'proposal',
    items: [
      {
        id: 'demo_item_impl',
        name: 'Implementation Services',
        price: 50000,
        category: 'implementation',
        baseCost: 30000,
        costStatus: 'approved',
      },
      {
        id: 'demo_item_training',
        name: 'Training & Documentation',
        price: 10000,
        category: 'implementation',
        baseCost: 5000,
        costStatus: 'approved',
      },
    ],
  },

  // SCENARIO 2: At-Budget (15% Margin) — YELLOW ZONE
  {
    id: 'demo_lead_at_budget',
    companyName: 'GlobalTech Solutions',
    contactName: 'Sarah Johnson',
    email: 'sarah.johnson@globaltech.com',
    stage: 'proposal',
    items: [
      {
        id: 'demo_item_support',
        name: 'Annual Managed Support',
        price: 40000,
        category: 'support',
        baseCost: 34000,
        costStatus: 'approved',
      },
    ],
  },

  // SCENARIO 3: Over-Budget (LOSS -13.3%) — RED ZONE
  {
    id: 'demo_lead_over_budget',
    companyName: 'TechStartup Innovations',
    contactName: 'Michael Chen',
    email: 'michael.chen@techstartup.com',
    stage: 'proposal',
    items: [
      {
        id: 'demo_item_dev_p1',
        name: 'Development Phase 1',
        price: 100000,
        category: 'implementation',
        baseCost: 80000,
        costStatus: 'reviewed',
      },
      {
        id: 'demo_item_dev_p2',
        name: 'Development Phase 2',
        price: 50000,
        category: 'implementation',
        baseCost: 90000, // Higher cost than sale price!
        costStatus: 'reviewed',
      },
    ],
  },

  // SCENARIO 4: No Costs Set Yet — To Test Full Workflow
  {
    id: 'demo_lead_no_costs',
    companyName: 'Enterprise Corp',
    contactName: 'Emily Davis',
    email: 'emily.davis@enterprisecorp.com',
    stage: 'proposal',
    items: [
      {
        id: 'demo_item_license',
        name: 'Software License (Year 1)',
        price: 75000,
        category: 'license',
        // No baseCost set — to be added during review
      },
      {
        id: 'demo_item_impl_service',
        name: 'Implementation Service',
        price: 30000,
        category: 'implementation',
        // No baseCost set — to be added during review
      },
    ],
  },
];

async function seedData() {
  console.log('🌱 Seeding Costing Demo Data...\n');

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // SEED USERS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('📝 Creating demo users...');
    for (const user of DEMO_USERS) {
      try {
        const res = await fetch(`${API_URL}/users`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            permissions: {
              dashboard: true,
              crm: true,
              projects: true,
              admin: user.role === 'admin',
              portal: user.role === 'consultant',
            },
          }),
        });

        if (res.ok) {
          const data = await res.json();
          console.log(`  ✅ ${user.name} (${user.role})`);
          if (user.role === 'admin') {
            console.log(`     canApproveCosting: ${data.canApproveCosting}`);
          }
        } else if (res.status === 400) {
          // User likely already exists
          console.log(`  ⚠️  ${user.name} already exists, skipping`);
        } else {
          console.error(`  ❌ Failed to create ${user.name}: ${res.status}`);
        }
      } catch (err) {
        console.error(`  ❌ Error creating ${user.name}:`, err);
      }
    }

    // ──────────────────────────────────────────────────────────────────────────
    // SEED LEADS
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n📋 Creating demo leads...');
    for (const lead of DEMO_LEADS) {
      try {
        const res = await fetch(`${API_URL}/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: lead.id,
            companyName: lead.companyName,
            contactName: lead.contactName,
            email: lead.email,
            stage: lead.stage,
            items: lead.items,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          const totalPrice = lead.items.reduce((sum, i) => sum + i.price, 0);
          const totalCost = lead.items.reduce((sum, i) => sum + (i.baseCost || 0), 0);
          const margin = totalPrice - totalCost;
          const marginPercent = totalPrice > 0 ? (margin / totalPrice) * 100 : 0;

          console.log(`  ✅ ${lead.companyName}`);
          console.log(`     Sale: $${totalPrice.toLocaleString()} | Cost: $${totalCost.toLocaleString()} | Margin: ${marginPercent.toFixed(1)}%`);
        } else if (res.status === 400) {
          console.log(`  ⚠️  ${lead.companyName} already exists, skipping`);
        } else {
          console.error(`  ❌ Failed to create ${lead.companyName}: ${res.status}`);
        }
      } catch (err) {
        console.error(`  ❌ Error creating ${lead.companyName}:`, err);
      }
    }

    console.log('\n✨ Seed complete!\n');
    console.log('📊 Demo Scenarios Ready:');
    console.log('  1. Acme Corporation - Healthy 40% margin (GREEN)');
    console.log('  2. GlobalTech Solutions - Thin 15% margin (YELLOW)');
    console.log('  3. TechStartup Innovations - -13.3% loss (RED)');
    console.log('  4. Enterprise Corp - No costs set yet (workflow test)');
    console.log('\n💡 Next Steps:');
    console.log('  1. Open CRM in browser (http://localhost:5173)');
    console.log('  2. Navigate to Pipeline view');
    console.log('  3. Click "Review Costs" on any demo lead');
    console.log('  4. Follow COSTING_TEST_CHECKLIST.md for testing');
  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  }
}

seedData();
