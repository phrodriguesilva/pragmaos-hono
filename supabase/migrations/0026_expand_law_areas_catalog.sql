-- =========================================================================
-- 0026 — Expand law_areas catalog to cover the full Brazilian legal market
-- References: TozziniFreire, market research, traditional + emerging areas
-- Idempotent: uses ON CONFLICT (slug) DO NOTHING
-- =========================================================================

-- First, fix accentuation on existing entries so slugs stay consistent
update law_areas set name = 'Direito da Família' where slug = 'direito-da-familia';
update law_areas set name = 'Direito Previdenciário' where slug = 'direito-previdenciario';
update law_areas set name = 'Direito do Trabalho' where slug = 'direito-do-trabalho';
update law_areas set name = 'Direito Tributário' where slug = 'direito-tributario';
update law_areas set name = 'Direito Imobiliário' where slug = 'direito-imobiliario';

-- Insert the expanded catalog (~40 areas total)
insert into law_areas (name, slug, icon) values
  -- Público
  ('Direito Constitucional', 'direito-constitucional', 'ph-scale'),
  ('Direito Eleitoral', 'direito-eleitoral', 'ph-check-square'),
  ('Direito Internacional', 'direito-internacional', 'ph-globe-hemisphere-west'),
  ('Direito Militar', 'direito-militar', 'ph-shield-star'),
  ('Direito Regulatório', 'direito-regulatorio', 'ph-sliders'),
  ('Direito Portuário e Marítimo', 'direito-portuario-e-maritimo', 'ph-anchor'),
  ('Direito Aeronáutico', 'direito-aeronautico', 'ph-airplane-tilt'),
  ('Direito Agrário', 'direito-agrario', 'ph-plant'),
  -- Privado / Empresarial
  ('Direito Societário', 'direito-societario', 'ph-buildings'),
  ('Direito Contratual', 'direito-contratual', 'ph-file-text'),
  ('Direito Bancário e Financeiro', 'direito-bancario-e-financeiro', 'ph-bank'),
  ('Direito do Mercado de Capitais', 'direito-do-mercado-de-capitais', 'ph-chart-line-up'),
  ('Direito Securitário', 'direito-securitario', 'ph-umbrella'),
  ('Direito de Fusões e Aquisições', 'direito-de-fusoes-e-aquisicoes', 'ph-handshake'),
  ('Direito de Recuperação e Falência', 'direito-de-recuperacao-e-falencia', 'ph-arrow-fat-down'),
  ('Direito de Propriedade Intelectual', 'direito-de-propriedade-intelectual', 'ph-lightbulb'),
  ('Direito Marcas e Patentes', 'direito-marcas-e-patentes', 'ph-trademark-registered'),
  ('Direito de Tecnologia e Inovação', 'direito-de-tecnologia-e-inovacao', 'ph-cpu'),
  ('Direito Digital e LGPD', 'direito-digital-e-lgpd', 'ph-lock-key'),
  ('Direito Cibernético', 'direito-cibernetico', 'ph-shield-check'),
  ('Direito de Startups e Venture Capital', 'direito-de-startups-e-venture-capital', 'ph-rocket-launch'),
  ('Direito Cripto e Web3', 'direito-cripto-e-web3', 'ph-currency-btc'),
  ('Direito de Negócios Imobiliários', 'direito-de-negocios-imobiliarios', 'ph-building-office'),
  ('Direito de Construção e Infraestrutura', 'direito-de-construcao-e-infraestrutura', 'ph-hard-hat'),
  ('Direito de Energia', 'direito-de-energia', 'ph-plug'),
  ('Direito de Mineração', 'direito-de-mineracao', 'ph-pickaxe'),
  ('Direito de Petróleo e Gás', 'direito-de-petroleo-e-gas', 'ph-gas-pump'),
  ('Direito de Telecomunicações', 'direito-de-telecomunicacoes', 'ph-cell-signal-full'),
  ('Direito de Saúde e Farmacêutico', 'direito-de-saude-e-farmaceutico', 'ph-first-aid-kit'),
  ('Direito de Seguros e Resseguros', 'direito-de-seguros-e-resseguros', 'ph-shield-check'),
  ('Direito de Transporte e Logística', 'direito-de-transporte-e-logistica', 'ph-truck'),
  ('Direito de Turismo e Hotelaria', 'direito-de-turismo-e-hotelaria', 'ph-airplane'),
  ('Direito de Educação', 'direito-de-educacao', 'ph-graduation-cap'),
  ('Direito de Entretenimento e Mídia', 'direito-de-entretenimento-e-midia', 'ph-film-strip'),
  ('Direito de Esportes e E-sports', 'direito-de-esportes-e-esports', 'ph-trophy'),
  ('Direito de Moda (Fashion Law)', 'direito-de-moda-fashion-law', 'ph-tshirt'),
  ('Direito de Agronegócio', 'direito-de-agronegocio', 'ph-tractor'),
  ('Direito de Terceiro Setor e ONGs', 'direito-de-terceiro-setor-e-ongs', 'ph-heartbeat'),
  ('Direito de Imigração', 'direito-de-imigracao', 'ph-passport'),
  ('Direito ESG e Sustentabilidade', 'direito-esg-e-sustentabilidade', 'ph-leaf'),
  ('Compliance e Governança', 'compliance-e-governanca', 'ph-shield-check'),
  ('Mediação e Arbitragem', 'mediacao-e-arbitragem', 'ph-handshake'),
  ('Contencioso Estratégico', 'contencioso-estrategico', 'ph-gavel'),
  ('Planejamento Patrimonial e Sucessório', 'planejamento-patrimonial-e-sucessorio', 'ph-piggy-bank'),
  ('Responsabilidade Civil', 'responsabilidade-civil', 'ph-scales'),
  ('Direito Médico', 'direito-medico', 'ph-stethoscope'),
  ('Direito Desportivo', 'direito-desportivo', 'ph-soccer-ball'),
  ('Direito da Concorrência', 'direito-da-concorrencia', 'ph-balance'),
  ('Direito do Terceiro Setor', 'direito-do-terceiro-setor', 'ph-hand-heart'),
  ('Relações Governamentais', 'relacoes-governamentais', 'ph-building'),
  ('Direito de Comércio Internacional', 'direito-de-comercio-internacional', 'ph-globe'),
  ('Direito Penal Empresarial', 'direito-penal-empresarial', 'ph-shield-warning'),
  ('Direito de Privacidade e Proteção de Dados', 'direito-de-privacidade-e-protecao-de-dados', 'ph-user-circle-dashed')
on conflict (slug) do nothing;
