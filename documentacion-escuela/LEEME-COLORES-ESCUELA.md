# Colores temáticos de la escuela — MinShop Default

## Instalación

1. Haz una copia de seguridad de `src/themes/default/tokens.css`.
2. Extrae este ZIP en la raíz de tu proyecto MinShop y permite sobrescribir el archivo.
3. Reinicia el servidor de desarrollo. Para producción, vuelve a compilar y desplegar como normalmente haces.

No hay migraciones ni paquetes npm nuevos.

## Dónde cambiar los colores

Todos los colores de marca están juntos al principio de:

`src/themes/default/tokens.css`

Busca la sección **COLORES DE LA ESCUELA: EDITA ESTA SECCIÓN**.

| Variable CSS | Valor inicial | Uso |
|---|---:|---|
| `--color-brand` | `#dc2626` | Rojo principal; botones `bg-brand` |
| `--color-brand-hover` | `#b91c1c` | Rojo al pasar el cursor |
| `--color-brand-soft` | `#fef2f2` | Fondo rojo suave |
| `--color-accent` | `#0e7490` | Turquesa oscuro; enlaces `text-accent` |
| `--color-accent-hover` | `#155e75` | Turquesa al pasar el cursor |
| `--color-accent-soft` | `#ecfeff` | Fondo turquesa suave |
| `--color-secondary` | `#0891b2` | Turquesa vivo; utilidades `bg-secondary`, `text-secondary` |
| `--color-on-accent` | `#ffffff` | Texto sobre fondos turquesa |
| `--color-on-brand` | `#ffffff` | Texto sobre botones rojos |

Los tokens `--color-brand`, `--color-brand-hover`, `--color-accent` y `--color-on-brand` ya se integran con las utilidades Tailwind que usa el tema. Los tokens adicionales `secondary`, `*-soft` y `on-accent` quedan disponibles para componentes nuevos o estilos CSS que los necesiten.

## Ejemplos de clases

```html
<a class="rounded-full bg-brand px-8 py-4 font-bold text-on-brand hover:bg-brand-hover">
  Iniciar proceso de Inscripción
</a>

<a class="font-semibold text-accent hover:text-accent-hover">
  Conocer el programa
</a>

<div class="rounded-xl bg-accent-soft p-4">
  Información destacada
</div>
```

## Alcance

Este archivo es el token de marca del tema **Default**. Cambia los colores de los componentes que usan los tokens del tema, tanto en la tienda como en las páginas que comparten ese tema. No modifica los temas Market, My Store ni Studio. No cambia manualmente las clases que tengan colores HEX o utilidades fijas como `bg-red-600`; esas clases seguirán usando su propio color.
