/**
Agregaré la columna "display_section" a la tabla products_lecturas para indicar en qué sección se debe mostrar cada producto.
*/

ALTER TABLE products_lecturas
ADD COLUMN display_section VARCHAR(255);
