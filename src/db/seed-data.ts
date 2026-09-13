import type { ChecklistItem } from './schema/logbook';

/**
 * Plantillas de checklist del Manual de Trabajo v1.5 del encargado.
 * Replican el cronograma de los Anexos A–H: el sistema no agrega trabajo,
 * digitaliza el que ya se hace en papel.
 *
 * `required: false` marca lo opcional, que NO penaliza el cumplimiento (RN-48).
 */
export type TemplateSeed = {
  name: string;
  freq: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'biannual' | 'annual' | 'seasonal';
  seasonal?: boolean;
  items: ChecklistItem[];
};

export const CHECKLIST_TEMPLATES: TemplateSeed[] = [
  {
    name: 'Recorrida y apertura del día',
    freq: 'daily',
    items: [
      { key: 'recorrida_perimetro', label: 'Recorrida del perímetro y accesos', required: true, section: 'Recorrida' },
      { key: 'recorrida_azotea', label: 'Control de azotea y desagües', required: true, section: 'Recorrida' },
      { key: 'recorrida_subsuelo', label: 'Control de subsuelo y bombas', required: true, section: 'Recorrida' },
      { key: 'iluminacion_comun', label: 'Iluminación de áreas comunes', required: true, section: 'Iluminación' },
      { key: 'iluminacion_emergencia', label: 'Luces de emergencia y salidas', required: true, section: 'Iluminación' },
      { key: 'ascensor_prueba', label: 'Prueba de ascensor y cabina de emergencia', required: true, section: 'Ascensores' },
      { key: 'porton_acceso', label: 'Portón vehicular y control de acceso', required: true, section: 'Accesos' },
      { key: 'camaras_estado', label: 'Cámaras: grabación activa', required: true, section: 'Seguridad' },
      { key: 'residuos_retiro', label: 'Retiro de residuos a contenedor', required: true, section: 'Residuos' },
      { key: 'residuos_sala', label: 'Limpieza de la sala de residuos', required: true, section: 'Residuos' },
      { key: 'limpieza_hall', label: 'Limpieza de hall y palieres', required: true, section: 'Limpieza' },
      { key: 'limpieza_escaleras', label: 'Limpieza de escaleras', required: false, section: 'Limpieza' },
      { key: 'parque_riego', label: 'Riego y control del parque', required: true, section: 'Parque', seasonal: true },
      { key: 'parrillero_estado', label: 'Estado del parrillero y SUM', required: false, section: 'Áreas comunes' },
      { key: 'atencion_residentes', label: 'Atención de consultas de residentes', required: true, section: 'Atención' },
      { key: 'cierre_verificacion', label: 'Verificación de cierre nocturno', required: true, section: 'Cierre' },
    ],
  },
  {
    name: 'Piscina — control diario (Anexo A)',
    freq: 'daily',
    seasonal: true,
    items: [
      { key: 'piscina_medicion', label: 'Medición de cloro, pH y alcalinidad', required: true, section: 'Piscina' },
      { key: 'piscina_desnatado', label: 'Desnatado de superficie', required: true, section: 'Piscina' },
      { key: 'piscina_cestas', label: 'Vaciado de cestas de skimmer', required: true, section: 'Piscina' },
      { key: 'piscina_filtro', label: 'Control de presión del filtro', required: true, section: 'Piscina' },
      { key: 'piscina_duchas', label: 'Duchas y solárium en condiciones', required: true, section: 'Piscina' },
      { key: 'piscina_cartel', label: 'Cartelería de seguridad visible', required: false, section: 'Piscina' },
    ],
  },
  {
    name: 'Control semanal',
    freq: 'weekly',
    items: [
      { key: 'sem_tanques', label: 'Nivel y estado de tanques de agua', required: true, section: 'Agua' },
      { key: 'sem_bombas', label: 'Prueba de bombas de presurización', required: true, section: 'Agua' },
      { key: 'sem_tablero', label: 'Inspección visual de tablero general', required: true, section: 'Electricidad' },
      { key: 'sem_grupo', label: 'Prueba en vacío del grupo electrógeno', required: true, section: 'Electricidad' },
      { key: 'sem_extintores', label: 'Control visual de extintores y mangueras', required: true, section: 'Incendio' },
      { key: 'sem_desagues', label: 'Limpieza de rejillas y desagües pluviales', required: true, section: 'Pluviales' },
      { key: 'sem_cocheras', label: 'Recorrida y limpieza de cocheras', required: true, section: 'Cocheras' },
      { key: 'sem_stock', label: 'Control de stock de insumos críticos', required: true, section: 'Stock' },
      { key: 'sem_jardin', label: 'Corte y mantenimiento del parque', required: false, section: 'Parque' },
    ],
  },
  {
    name: 'Control mensual',
    freq: 'monthly',
    items: [
      { key: 'mes_ascensor_service', label: 'Acompañar el service mensual de ascensores', required: true, section: 'Ascensores' },
      { key: 'mes_grupo_carga', label: 'Prueba con carga del grupo electrógeno', required: true, section: 'Electricidad' },
      { key: 'mes_bombas_incendio', label: 'Prueba de bomba de incendio', required: true, section: 'Incendio' },
      { key: 'mes_tanque_limpieza', label: 'Verificación de limpieza de tanques', required: true, section: 'Agua' },
      { key: 'mes_luminaria', label: 'Reposición de luminarias quemadas', required: true, section: 'Iluminación' },
      { key: 'mes_inventario', label: 'Inventario de herramientas e insumos', required: true, section: 'Stock' },
      { key: 'mes_informe', label: 'Cierre del informe mensual', required: true, section: 'Informe' },
      { key: 'mes_planilla_piscina', label: 'Cierre de la planilla de piscina del mes', required: false, section: 'Piscina' },
    ],
  },
  {
    name: 'Control trimestral',
    freq: 'quarterly',
    items: [
      { key: 'tri_tanques_limpieza', label: 'Limpieza y desinfección de tanques', required: true, section: 'Agua' },
      { key: 'tri_pluviales', label: 'Limpieza profunda de pluviales y canaletas', required: true, section: 'Pluviales' },
      { key: 'tri_fachada', label: 'Inspección visual de fachada y juntas', required: true, section: 'Estructura' },
      { key: 'tri_puesta_tierra', label: 'Verificación de puesta a tierra', required: true, section: 'Electricidad' },
      { key: 'tri_cctv', label: 'Revisión del sistema de CCTV y respaldos', required: true, section: 'Seguridad' },
    ],
  },
  {
    name: 'Control semestral',
    freq: 'biannual',
    items: [
      { key: 'sem2_extintores_carga', label: 'Recarga y control técnico de extintores', required: true, section: 'Incendio' },
      { key: 'sem2_pintura', label: 'Relevamiento de pintura y humedades', required: true, section: 'Estructura' },
      { key: 'sem2_seguros', label: 'Verificación de vigencia de pólizas', required: true, section: 'Documentación' },
    ],
  },
  {
    name: 'Preparación de temporada alta',
    freq: 'seasonal',
    seasonal: true,
    items: [
      { key: 'temp_piscina_apertura', label: 'Puesta a punto de la piscina', required: true, section: 'Temporada' },
      { key: 'temp_parrilleros', label: 'Acondicionamiento de parrilleros y SUM', required: true, section: 'Temporada' },
      { key: 'temp_mobiliario', label: 'Mobiliario de solárium en condiciones', required: true, section: 'Temporada' },
      { key: 'temp_refuerzo_limpieza', label: 'Refuerzo de frecuencia de limpieza', required: true, section: 'Temporada' },
      { key: 'temp_stock_extra', label: 'Stock reforzado de insumos de piscina', required: true, section: 'Temporada' },
      { key: 'temp_reglamento', label: 'Cartelería de reglamento de uso visible', required: true, section: 'Temporada' },
    ],
  },
  {
    name: 'Control anual',
    freq: 'annual',
    items: [
      { key: 'anu_ascensor_habilitacion', label: 'Habilitación anual de ascensores', required: true, section: 'Ascensores' },
      { key: 'anu_incendio_habilitacion', label: 'Habilitación de bomberos', required: true, section: 'Incendio' },
      { key: 'anu_pararrayos', label: 'Medición de pararrayos', required: true, section: 'Electricidad' },
      { key: 'anu_inventario_activos', label: 'Inventario general de activos', required: true, section: 'Activos' },
    ],
  },
];

/** Anexo E — insumos críticos que el edificio no puede quedarse sin tener. */
export const STOCK_ITEMS = [
  { name: 'Hipoclorito de sodio', unitOfMeasure: 'L', minQuantity: '20.00', currentQuantity: '40.00' },
  { name: 'Cloro granulado', unitOfMeasure: 'kg', minQuantity: '10.00', currentQuantity: '25.00' },
  { name: 'Reductor de pH', unitOfMeasure: 'L', minQuantity: '5.00', currentQuantity: '10.00' },
  { name: 'Elevador de pH', unitOfMeasure: 'kg', minQuantity: '5.00', currentQuantity: '8.00' },
  { name: 'Alguicida', unitOfMeasure: 'L', minQuantity: '4.00', currentQuantity: '6.00' },
  { name: 'Reactivos de test de piscina', unitOfMeasure: 'juego', minQuantity: '1.00', currentQuantity: '2.00' },
  { name: 'Bolsas de residuo 120 L', unitOfMeasure: 'unidad', minQuantity: '100.00', currentQuantity: '250.00' },
  { name: 'Detergente industrial', unitOfMeasure: 'L', minQuantity: '10.00', currentQuantity: '20.00' },
  { name: 'Lámpara LED E27', unitOfMeasure: 'unidad', minQuantity: '12.00', currentQuantity: '24.00' },
  { name: 'Tubo LED 18 W', unitOfMeasure: 'unidad', minQuantity: '8.00', currentQuantity: '15.00' },
  { name: 'Fusibles de tablero', unitOfMeasure: 'unidad', minQuantity: '10.00', currentQuantity: '20.00' },
  { name: 'Guantes de trabajo', unitOfMeasure: 'par', minQuantity: '4.00', currentQuantity: '10.00' },
];

/** Rubros presupuestales. Existen ya en v1 aunque el v1 no calcule expensas (regla 4). */
export const BUDGET_CATEGORIES = [
  { code: 'MANT', name: 'Mantenimiento general' },
  { code: 'LIMP', name: 'Limpieza' },
  { code: 'PISC', name: 'Piscina' },
  { code: 'PARQ', name: 'Parque y jardinería' },
  { code: 'SERV', name: 'Servicios (agua, luz, gas)' },
  { code: 'SEGU', name: 'Seguros' },
  { code: 'HONO', name: 'Honorarios' },
  { code: 'OBRA', name: 'Obras y mejoras' },
  { code: 'ASCE', name: 'Ascensores' },
  { code: 'SEGD', name: 'Seguridad y vigilancia' },
];

export const ASSETS = [
  { name: 'Ascensor principal', category: 'ascensor', location: 'Núcleo central', criticality: 'critical' as const },
  { name: 'Ascensor de servicio', category: 'ascensor', location: 'Núcleo de servicio', criticality: 'critical' as const },
  { name: 'Bomba de presurización 1', category: 'bomba', location: 'Sala de máquinas', criticality: 'critical' as const },
  { name: 'Bomba de presurización 2', category: 'bomba', location: 'Sala de máquinas', criticality: 'normal' as const },
  { name: 'Bomba de achique de subsuelo', category: 'bomba', location: 'Subsuelo', criticality: 'critical' as const },
  { name: 'Grupo electrógeno', category: 'tablero', location: 'Sala de máquinas', criticality: 'critical' as const },
  { name: 'Tablero general', category: 'tablero', location: 'Planta baja', criticality: 'critical' as const },
  { name: 'Portón vehicular', category: 'porton', location: 'Acceso cocheras', criticality: 'normal' as const },
  { name: 'Sistema de CCTV', category: 'camara', location: 'Portería', criticality: 'normal' as const },
  { name: 'Piscina exterior', category: 'piscina', location: 'Solárium', criticality: 'normal' as const },
  { name: 'Filtro de piscina', category: 'piscina', location: 'Sala de bombas', criticality: 'normal' as const },
  { name: 'Red de incendio', category: 'incendio', location: 'Todo el edificio', criticality: 'critical' as const },
  { name: 'Tanque de agua superior', category: 'agua', location: 'Azotea', criticality: 'critical' as const },
];

/** Planes preventivos que alimentan `generate-maintenance-tasks`. */
export const MAINTENANCE_PLANS = [
  { assetName: 'Ascensor principal', name: 'Service mensual de ascensor principal', freq: 'monthly' as const, intervalCount: 1 },
  { assetName: 'Ascensor de servicio', name: 'Service mensual de ascensor de servicio', freq: 'monthly' as const, intervalCount: 1 },
  { assetName: 'Grupo electrógeno', name: 'Prueba con carga del grupo electrógeno', freq: 'monthly' as const, intervalCount: 1 },
  { assetName: 'Red de incendio', name: 'Control técnico de extintores', freq: 'biannual' as const, intervalCount: 1 },
  { assetName: 'Tanque de agua superior', name: 'Limpieza y desinfección de tanques', freq: 'quarterly' as const, intervalCount: 1 },
  { assetName: 'Filtro de piscina', name: 'Retrolavado y control de filtro', freq: 'weekly' as const, intervalCount: 1 },
  { assetName: 'Bomba de achique de subsuelo', name: 'Prueba de bomba de achique', freq: 'weekly' as const, intervalCount: 1 },
  { assetName: 'Sistema de CCTV', name: 'Revisión de CCTV y respaldos', freq: 'quarterly' as const, intervalCount: 1 },
];
