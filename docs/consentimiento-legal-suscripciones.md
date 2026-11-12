# Consentimiento y avisos para suscripciones

## Cómo funciona

- En Administración → Suscripciones se editan, por plan, la política de reembolso, el aviso de privacidad, su URL integral y las condiciones del plan con la autorización para cargos recurrentes.
- El checkout muestra el precio, periodicidad y renovación automática, ofrece un enlace a todos los textos y pide **una sola casilla obligatoria**: aceptación de las condiciones y reembolsos, reconocimiento de haber podido consultar el aviso, y autorización expresa de los cargos recurrentes.
- El servidor vuelve a exigir la casilla; un `POST` fabricado no inicia Checkout sin aceptarla. Antes de redirigir a Stripe se guarda en D1 una copia de las condiciones, el precio, periodicidad y fecha/hora de aceptación. El webhook asocia esa prueba a la suscripción. Mi cuenta muestra la copia que el cliente aceptó aunque después cambies el texto del plan.
- El cron de Cloudflare, programado cada cinco minutos, envía un aviso de renovación con importe, periodicidad y acceso directo a cancelación al detectar un cobro aproximadamente cinco días antes. Requiere correo saliente habilitado y configurado. Si no existe un proveedor de correo operativo, el aviso no puede entregarse.
- Cancelar desde Mi cuenta procesa inmediatamente la solicitud y programa el fin de la renovación en Stripe al final del periodo ya pagado; el cliente conserva el acceso pagado hasta esa fecha.

## Requisitos revisados

La versión vigente consultada de la Ley Federal de Protección al Consumidor incorpora en el artículo 76 Bis, fracción VIII, la obligación de informar de forma clara, destacada y accesible que existen cobros automáticos, su periodicidad, monto y fecha; exige consentimiento expreso e informado; y, para renovaciones automáticas, notificación con al menos cinco días naturales para que se pueda cancelar sin penalización. La fracción IX requiere un mecanismo para cancelar de manera inmediata. La interfaz muestra la información previa, captura y registra el consentimiento y conserva el flujo de cancelación; el recordatorio sale por correo cinco días antes.

La Ley Federal de Protección de Datos Personales en Posesión de los Particulares requiere poner a disposición el aviso de privacidad con información del responsable y el tratamiento. La casilla confirma que el aviso estuvo disponible, no sustituye el aviso integral ni convierte automáticamente todos los consentimientos de datos en válidos. Completa identidad, domicilio, contacto, finalidades, transferencias y mecanismos ARCO con la información real de tu negocio.

Stripe establece que, antes del primer pago recurrente, el comercio debe informar que habrá pagos continuos y explicar cómo cancelar; su guía para mandatos de pagos recomienda dejar claros el consentimiento para iniciar pagos, frecuencia y cálculo del importe. El mismo botón de aceptación cubre estas declaraciones junto con las condiciones del plan.

Fuentes consultadas:

- [Ley Federal de Protección al Consumidor (Cámara de Diputados; reforma DOF 12-12-2025)](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPC.pdf), artículo 76 Bis, fracciones VIII y IX.
- [Ley Federal de Protección de Datos Personales en Posesión de los Particulares (Cámara de Diputados)](https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf).
- [Stripe: consentimiento para pagos recurrentes y mandatos](https://support.stripe.com/questions/updating-your-terms-and-conditions-to-make-sure-customers-have-been-given-a-mandate-to-collect-recurring-payments-for-strong-customer-authentication-%28sca%29-purposes?locale=en-GB).
- [Stripe Services Agreement, cláusula de suscripciones y facturación](https://stripe.com/en-se/legal/ssa-services-terms).

## Qué debes completar

Las plantillas de Admin están prellenadas para que puedas editarlas, pero contienen marcas `[ENTRE CORCHETES]`. El checkout rechaza el inicio de una suscripción activa mientras quede alguna marca entre corchetes en las políticas, para evitar vender con datos de ejemplo.

1. Sustituye `[NOMBRE LEGAL O COMERCIAL Y DOMICILIO]`, `[NOMBRE DEL COMERCIO]`, `[CORREO DE SOPORTE]` y `[CORREO DE PRIVACIDAD]` por datos válidos y atendidos.
2. Ajusta la política de reembolso a lo que efectivamente ofrecerás, sin limitar derechos irrenunciables.
3. Completa el aviso integral de privacidad con responsable, domicilio, categorías y finalidades de los datos, transferencias, opciones para limitar uso/divulgación y procedimiento ARCO. Puedes enlazar la versión completa con `https://…`; el texto resumido del plan sigue visible durante el checkout y en la cuenta.
4. Confirma en Stripe que el Price tiene exactamente el mismo importe, moneda e intervalo configurados en Admin.
5. Habilita un proveedor de correo en Administración → Ajustes. El recordatorio de renovación depende de ello.

Aplica `0072_subscription_legal_consent.sql` después de `0071_content_subscriptions_and_product_sections.sql`, localmente y en remoto, antes de desplegar el código.
