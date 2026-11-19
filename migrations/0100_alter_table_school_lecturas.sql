ALTER TABLE school_lecturas
ADD COLUMN image_url VARCHAR(255);

--Agregamos type de lectura (article, blog, magazine-edition, book, etc.)
ALTER TABLE school_lecturas
ADD COLUMN type VARCHAR(255);

ALTER TABLE school_lecturas
ADD COLUMN description TEXT;

