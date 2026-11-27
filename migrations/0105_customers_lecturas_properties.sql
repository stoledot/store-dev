/**
Agregar:
 - columna fecha de caducidad (expiration date) (si aplica)
 - columna de fecha en que se realizó la compra o tuvo acceso a la lectura
 - columna de número de planes que definir en la lectura (si aplica)
 - columna de número de dispositivos simultáneos (si aplica)
*/

ALTER TABLE school_lecturas_customers ADD COLUMN expiration_date TEXT;
ALTER TABLE school_lecturas_customers ADD COLUMN purchase_date TEXT;
ALTER TABLE school_lecturas_customers ADD COLUMN number_of_plans INTEGER;
ALTER TABLE school_lecturas_customers ADD COLUMN simultaneous_devices INTEGER;


