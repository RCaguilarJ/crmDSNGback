# Web Push

Las notificaciones Web Push no requieren un proveedor de pago.

## Configuración inicial

1. Genera una pareja de claves una sola vez:

   ```bash
   npm run push:keys
   ```

2. Agrega el resultado al archivo `.env` del backend:

   ```env
   VAPID_SUBJECT=mailto:soporte@tudominio.com
   VAPID_PUBLIC_KEY=clave_publica_generada
   VAPID_PRIVATE_KEY=clave_privada_generada
   ```

3. Reinicia el backend.

La clave pública se entrega al navegador. La clave privada debe permanecer únicamente en el servidor y no debe subirse al repositorio.

## Funcionamiento

- Cada usuario activa los avisos desde la campana del CRM.
- La suscripción de cada navegador se guarda en `push_subscriptions`.
- Crear o reasignar una tarea envía un aviso al responsable.
- Cambiar el estado de una tarea avisa a todos los usuarios suscritos, excepto a quien realizó el cambio.
- El backend revisa vencimientos al iniciar y cada seis horas.
- `push_deliveries` impide repetir una alerta de vencimiento en el mismo dispositivo.
- Las suscripciones expiradas se eliminan automáticamente.

En producción el sitio debe usar HTTPS. `localhost` puede usarse para desarrollo.
