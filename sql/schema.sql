CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  telegram_id TEXT,
  preferred_channel TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE cases (
  id SERIAL PRIMARY KEY,
  case_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  subject TEXT,
  status TEXT DEFAULT 'open',
  intent TEXT,
  sentiment TEXT,
  priority TEXT DEFAULT 'P2',
  channel_origin TEXT,
  last_activity_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  closed_at TIMESTAMP
);

CREATE TABLE messages (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id),
  customer_id INTEGER REFERENCES customers(id),
  channel TEXT,
  sender_type TEXT,
  message_text TEXT,
  internal_only BOOLEAN DEFAULT FALSE,
  ai_generated BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE case_events (
  id SERIAL PRIMARY KEY,
  case_id INTEGER REFERENCES cases(id),
  event_type TEXT,
  event_description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO customers 
(name, email, phone, telegram_id, preferred_channel)
VALUES
('Maya Chen', 'maya.chen@example.com', '+14155550101', 'tg_maya_chen', 'web_chat'),
('Arjun Mehta', 'arjun.mehta@example.com', '+14155550102', 'tg_arjun_mehta', 'telegram'),
('Sofia Garcia', 'sofia.garcia@example.com', '+14155550103', 'tg_sofia_garcia', 'email');