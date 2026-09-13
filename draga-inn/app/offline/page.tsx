import { Marca } from '@/ui/Marca';

export const metadata = { title: 'Sin conexión' };

export default function SinConexion() {
  return (
    <>
      <header className="barra-superior"><Marca /></header>
      <main id="contenido" className="contenedor-angosto">
        <div className="estado-vacio">
          <p className="titulo">No pudimos cargar esta pantalla</p>
          <p>Estás sin conexión y esta pantalla todavía no se guardó en el teléfono.</p>
          <p>Lo que registraste sin señal está a salvo y se va a enviar solo cuando vuelva la conexión.</p>
          <a className="boton" href="/pwa">Volver a Hoy</a>
        </div>
      </main>
    </>
  );
}
