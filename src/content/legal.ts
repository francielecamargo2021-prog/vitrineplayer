import type { Locale } from "@/i18n/config";

/**
 * Privacidade, Termos e Contato — ESTRUTURA PRELIMINAR (LGPD + dados de crianças e
 * adolescentes). Não é texto jurídico aprovado: as páginas mostram esse aviso no topo.
 *
 * Dados da empresa ainda não informados ficam em `LEGAL_INFO` como null e aparecem
 * nas páginas como "[a definir]". Ao preencher, troque também `LEGAL_VERSION`.
 * Marcas no texto: {controlador} {documento} {endereco} {encarregado} {email} {email_provider} {foro}.
 */
export const LEGAL_VERSION = "2026-10 (rascunho)";
export const LEGAL_STATUS: "draft" | "approved" = "draft";

export const LEGAL_INFO: Record<"controlador" | "documento" | "endereco" | "encarregado" | "email" | "email_provider" | "foro", string | null> = {
  controlador: null, // razão social do controlador
  documento: null, // CNPJ
  endereco: null,
  encarregado: null, // encarregado pelo tratamento de dados (DPO)
  email: null, // e-mail de contato e de privacidade
  email_provider: null, // fornecedor de envio de e-mails
  foro: null,
};

export type LegalSection = { id: string; title: string; body?: string[]; list?: string[]; table?: { head: [string, string]; rows: [string, string][] } };
export type LegalDoc = { title: [string, string]; lead: string; sections: LegalSection[] };

type Ui = {
  draftTitle: string; draftBody: string; version: string; contents: string; placeholder: string;
  nav: { privacy: string; terms: string; contact: string }; back: string;
};

export const legalUi: Record<Locale, Ui> = {
  pt: {
    draftTitle: "Versão preliminar",
    draftBody: "Esta página é uma estrutura em revisão jurídica, publicada apenas para homologação. Não é um texto jurídico aprovado e pode mudar antes do lançamento. Os campos “[a definir]” serão preenchidos pela empresa responsável.",
    version: "Versão",
    contents: "Nesta página",
    placeholder: "a definir",
    nav: { privacy: "Privacidade", terms: "Termos de Uso", contact: "Contato" },
    back: "Voltar para a home",
  },
  es: {
    draftTitle: "Versión preliminar",
    draftBody: "Esta página es una estructura en revisión jurídica, publicada solo para homologación. No es un texto jurídico aprobado y puede cambiar antes del lanzamiento. Los campos “[a definir]” serán completados por la empresa responsable.",
    version: "Versión",
    contents: "En esta página",
    placeholder: "a definir",
    nav: { privacy: "Privacidad", terms: "Términos de Uso", contact: "Contacto" },
    back: "Volver al inicio",
  },
};

// ============================================================================ PRIVACIDADE
const privacyPt: LegalDoc = {
  title: ["Privacidade", "e LGPD"],
  lead: "Como a VitrinePlayer trata os dados de atletas, responsáveis e profissionais — com cuidado redobrado com crianças e adolescentes.",
  sections: [
    {
      id: "quem-somos", title: "Quem trata os seus dados",
      body: [
        "Controlador: {controlador}, inscrita no CNPJ {documento}, com sede em {endereco}.",
        "Encarregado pelo tratamento de dados pessoais (art. 41 da LGPD): {encarregado}. Contato: {email}.",
      ],
    },
    {
      id: "a-quem-se-aplica", title: "A quem esta política se aplica",
      list: [
        "Responsáveis: pais, mães e responsáveis legais que criam a conta e cadastram atletas.",
        "Atletas: inclusive crianças e adolescentes, cujos perfis são sempre geridos por um responsável.",
        "Profissionais: clubes, empresários, agentes, olheiros, escolas e centros de captação, depois de verificados.",
        "Visitantes do site público.",
      ],
    },
    {
      id: "menores", title: "Crianças e adolescentes",
      body: ["O tratamento de dados de crianças e adolescentes segue o melhor interesse deles (art. 14 da LGPD e Estatuto da Criança e do Adolescente). Na prática:"],
      list: [
        "Só uma pessoa maior de 18 anos, que declara ser mãe, pai ou responsável legal, pode cadastrar um atleta menor de idade.",
        "O perfil só é exibido a profissionais com o consentimento específico e destacado desse responsável, registrado com data e versão do texto.",
        "Contatos do atleta e do responsável (WhatsApp, e-mail, endereço) nunca são mostrados a profissionais.",
        "Todo interesse de um profissional chega primeiro ao responsável, que decide aceitar ou recusar.",
        "Perfis passam por revisão da equipe antes de ficarem visíveis; atletas não veem perfis de outros atletas.",
        "Só profissionais verificados acessam perfis, com limites diários de consulta.",
        "O responsável pode ocultar o perfil, bloquear organizações, corrigir dados e excluir tudo a qualquer momento.",
        "Não condicionamos o uso da plataforma ao fornecimento de dados além do necessário (art. 14, § 4º).",
        "Não usamos dados de crianças e adolescentes para publicidade nem para perfilamento comercial.",
      ],
    },
    {
      id: "dados", title: "Quais dados tratamos",
      table: {
        head: ["Categoria", "Dados"],
        rows: [
          ["Conta", "Nome, e-mail, senha (guardada de forma cifrada pelo serviço de autenticação), WhatsApp, país e idioma."],
          ["Consentimentos", "Quais termos foram aceitos, versão, data, endereço IP e navegador usados no aceite."],
          ["Perfil do atleta", "Nome e nome esportivo, data de nascimento, sexo, país, estado e cidade, nacionalidade, modalidade, posições, pé dominante, altura, peso, clube, categoria, competições, conquistas, características, objetivos, disponibilidade, fotos e links de vídeos."],
          ["Profissionais", "Organização, tipo, documento, registro ou licença, site, cidade, cargo do contato e membros da equipe."],
          ["Uso da plataforma", "Perfis consultados por organização, listas, notas e avaliações internas, interesses, denúncias e registros das ações administrativas."],
          ["Segurança", "Registros de acesso e contadores de tentativas de login (guardados como código irreversível, sem e-mail ou IP em texto)."],
          ["Análise técnica por IA", "Desligada nesta fase. Se for oferecida, só com consentimento específico do responsável para cada atleta."],
        ],
      },
    },
    {
      id: "finalidades", title: "Para que usamos e com qual base legal",
      body: ["As bases legais abaixo estão em validação jurídica."],
      table: {
        head: ["Finalidade", "Base legal (LGPD)"],
        rows: [
          ["Criar e manter a conta e o perfil", "Execução de contrato (art. 7º, V)"],
          ["Exibir o perfil de atleta menor a profissionais verificados", "Consentimento específico do responsável (art. 14, § 1º)"],
          ["Verificar profissionais, revisar perfis e moderar conteúdo", "Legítimo interesse e proteção de crianças e adolescentes (art. 7º, IX)"],
          ["Segurança, prevenção a fraudes e limite de tentativas", "Legítimo interesse (art. 7º, IX)"],
          ["Guardar registros de acesso pelo prazo legal", "Obrigação legal (art. 7º, II; Marco Civil da Internet, art. 15)"],
          ["Análise técnica por IA (quando oferecida)", "Consentimento (art. 7º, I e art. 14, § 1º)"],
        ],
      },
    },
    {
      id: "compartilhamento", title: "Com quem compartilhamos",
      list: [
        "Profissionais verificados: veem o perfil esportivo aprovado, nunca os contatos.",
        "Responsáveis: recebem os interesses enviados pelos profissionais.",
        "Fornecedores que operam a plataforma em nosso nome: hospedagem (Vercel), banco de dados e autenticação (Neon), armazenamento privado de fotos (Vercel Blob) e envio de e-mails ({email_provider}).",
        "Análise por IA (Google, API Gemini): somente se o recurso for ativado e houver consentimento.",
        "Autoridades públicas, quando houver obrigação legal ou ordem judicial.",
        "Não vendemos dados pessoais.",
      ],
    },
    {
      id: "transferencia", title: "Transferência internacional",
      body: [
        "O banco de dados fica na região de São Paulo. Alguns fornecedores têm sede ou servidores fora do Brasil (por exemplo, nos Estados Unidos). Nesses casos, a transferência segue o art. 33 da LGPD, com as salvaguardas contratuais aplicáveis. [Em validação jurídica.]",
      ],
    },
    {
      id: "retencao", title: "Por quanto tempo guardamos",
      list: [
        "Dados da conta e dos atletas: enquanto a conta existir.",
        "Ao excluir a conta: apagamos o perfil, os atletas sob responsabilidade exclusiva e as fotos.",
        "Registros mínimos de consentimento e de ações administrativas: pelo prazo necessário para comprovar o cumprimento da lei ([prazo a definir]).",
        "Registros de acesso: 6 meses (Marco Civil da Internet).",
        "Contadores de tentativas de login: apagados até 1 dia depois da última tentativa.",
        "Cópias de segurança técnicas: [prazo a definir].",
      ],
    },
    {
      id: "direitos", title: "Seus direitos",
      body: ["Você pode pedir, a qualquer momento (art. 18 da LGPD):"],
      list: [
        "confirmação de que tratamos seus dados e acesso a eles;",
        "correção de dados incompletos, inexatos ou desatualizados;",
        "anonimização, bloqueio ou eliminação de dados desnecessários;",
        "portabilidade dos dados;",
        "informação sobre com quem compartilhamos;",
        "revogação do consentimento e eliminação dos dados tratados com base nele;",
        "revisão de decisões tomadas só por meios automatizados (a plataforma não toma decisões automatizadas sobre atletas).",
      ],
    },
    {
      id: "como-exercer", title: "Como exercer os seus direitos",
      list: [
        "Na área “Minha conta”, depois de entrar: baixar uma cópia dos seus dados e excluir a conta.",
        "No perfil do atleta: corrigir dados, ocultar o perfil e bloquear organizações.",
        "Pelo e-mail {email}, para os demais pedidos. Respondemos em até 15 dias.",
        "Você também pode apresentar reclamação à Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
    {
      id: "seguranca", title: "Segurança",
      list: [
        "Conexão cifrada (HTTPS) em todo o site.",
        "Controle de acesso no próprio banco de dados: cada pessoa só lê o que pode ver.",
        "Segundo fator obrigatório para administradores.",
        "Fotos em armazenamento privado, sem dados de localização.",
        "Limite de tentativas de login e de códigos enviados por e-mail.",
        "Registro das ações administrativas.",
        "Em caso de incidente de segurança relevante, comunicaremos a ANPD e as pessoas afetadas (art. 48).",
      ],
    },
    {
      id: "cookies", title: "Cookies",
      body: [
        "Usamos apenas cookies essenciais: sessão de login, segundo fator de administradores e reconhecimento do aparelho (para não bloquear a sua conta quando outra pessoa erra a senha). Não usamos cookies de publicidade nem de análise de terceiros.",
      ],
    },
    {
      id: "alteracoes", title: "Alterações nesta política",
      body: ["Avisaremos sobre mudanças relevantes e, quando a lei exigir, pediremos um novo consentimento. A versão em vigor aparece no topo desta página."],
    },
  ],
};

const privacyEs: LegalDoc = {
  title: ["Privacidad", "y LGPD"],
  lead: "Cómo VitrinePlayer trata los datos de atletas, responsables y profesionales — con cuidado redoblado con niños, niñas y adolescentes.",
  sections: [
    {
      id: "quienes-somos", title: "Quién trata sus datos",
      body: [
        "Responsable del tratamiento: {controlador}, CNPJ {documento}, con sede en {endereco}.",
        "Encargado de protección de datos (art. 41 de la LGPD de Brasil): {encarregado}. Contacto: {email}.",
      ],
    },
    {
      id: "a-quien-se-aplica", title: "A quién se aplica esta política",
      list: [
        "Responsables: madres, padres y tutores legales que crean la cuenta y registran atletas.",
        "Atletas: incluidos niños, niñas y adolescentes, cuyos perfiles siempre gestiona un responsable.",
        "Profesionales: clubes, representantes, agentes, ojeadores, escuelas y centros de captación, después de ser verificados.",
        "Visitantes del sitio público.",
      ],
    },
    {
      id: "menores", title: "Niños, niñas y adolescentes",
      body: ["El tratamiento de datos de menores sigue su interés superior (art. 14 de la LGPD y Estatuto del Niño y del Adolescente de Brasil). En la práctica:"],
      list: [
        "Solo una persona mayor de 18 años, que declara ser madre, padre o tutor legal, puede registrar a un atleta menor de edad.",
        "El perfil solo se muestra a profesionales con el consentimiento específico y destacado de ese responsable, registrado con fecha y versión del texto.",
        "Los contactos del atleta y del responsable (WhatsApp, correo, dirección) nunca se muestran a profesionales.",
        "Todo interés de un profesional llega primero al responsable, que decide aceptarlo o rechazarlo.",
        "Los perfiles pasan por revisión del equipo antes de ser visibles; los atletas no ven perfiles de otros atletas.",
        "Solo profesionales verificados acceden a perfiles, con límites diarios de consulta.",
        "El responsable puede ocultar el perfil, bloquear organizaciones, corregir datos y eliminarlo todo en cualquier momento.",
        "No condicionamos el uso de la plataforma a entregar más datos de los necesarios (art. 14, § 4).",
        "No usamos datos de menores para publicidad ni para perfiles comerciales.",
      ],
    },
    {
      id: "datos", title: "Qué datos tratamos",
      table: {
        head: ["Categoría", "Datos"],
        rows: [
          ["Cuenta", "Nombre, correo, contraseña (guardada cifrada por el servicio de autenticación), WhatsApp, país e idioma."],
          ["Consentimientos", "Qué términos se aceptaron, versión, fecha, dirección IP y navegador usados al aceptar."],
          ["Perfil del atleta", "Nombre y nombre deportivo, fecha de nacimiento, sexo, país, estado y ciudad, nacionalidad, modalidad, posiciones, pie hábil, altura, peso, club, categoría, competiciones, logros, características, objetivos, disponibilidad, fotos y enlaces de videos."],
          ["Profesionales", "Organización, tipo, documento, registro o licencia, sitio web, ciudad, cargo del contacto y miembros del equipo."],
          ["Uso de la plataforma", "Perfiles consultados por organización, listas, notas y evaluaciones internas, intereses, denuncias y registros de acciones administrativas."],
          ["Seguridad", "Registros de acceso y contadores de intentos de inicio de sesión (guardados como código irreversible, sin correo ni IP en texto)."],
          ["Análisis técnico por IA", "Desactivado en esta fase. Si se ofrece, solo con consentimiento específico del responsable para cada atleta."],
        ],
      },
    },
    {
      id: "finalidades", title: "Para qué los usamos y con qué base legal",
      body: ["Las bases legales siguientes están en validación jurídica."],
      table: {
        head: ["Finalidad", "Base legal (LGPD)"],
        rows: [
          ["Crear y mantener la cuenta y el perfil", "Ejecución de contrato (art. 7, V)"],
          ["Mostrar el perfil de un atleta menor a profesionales verificados", "Consentimiento específico del responsable (art. 14, § 1)"],
          ["Verificar profesionales, revisar perfiles y moderar contenido", "Interés legítimo y protección de menores (art. 7, IX)"],
          ["Seguridad, prevención de fraudes y límite de intentos", "Interés legítimo (art. 7, IX)"],
          ["Guardar registros de acceso por el plazo legal", "Obligación legal (art. 7, II; Marco Civil de Internet, art. 15)"],
          ["Análisis técnico por IA (cuando se ofrezca)", "Consentimiento (art. 7, I y art. 14, § 1)"],
        ],
      },
    },
    {
      id: "comparticion", title: "Con quién compartimos",
      list: [
        "Profesionales verificados: ven el perfil deportivo aprobado, nunca los contactos.",
        "Responsables: reciben los intereses enviados por los profesionales.",
        "Proveedores que operan la plataforma en nuestro nombre: alojamiento (Vercel), base de datos y autenticación (Neon), almacenamiento privado de fotos (Vercel Blob) y envío de correos ({email_provider}).",
        "Análisis por IA (Google, API Gemini): solo si el recurso se activa y hay consentimiento.",
        "Autoridades públicas, cuando exista obligación legal u orden judicial.",
        "No vendemos datos personales.",
      ],
    },
    {
      id: "transferencia", title: "Transferencia internacional",
      body: [
        "La base de datos está en la región de São Paulo. Algunos proveedores tienen sede o servidores fuera de Brasil (por ejemplo, en Estados Unidos). En esos casos, la transferencia sigue el art. 33 de la LGPD, con las salvaguardas contractuales aplicables. [En validación jurídica.]",
      ],
    },
    {
      id: "conservacion", title: "Por cuánto tiempo los guardamos",
      list: [
        "Datos de la cuenta y de los atletas: mientras la cuenta exista.",
        "Al eliminar la cuenta: borramos el perfil, los atletas bajo responsabilidad exclusiva y las fotos.",
        "Registros mínimos de consentimiento y de acciones administrativas: por el plazo necesario para demostrar el cumplimiento de la ley ([plazo a definir]).",
        "Registros de acceso: 6 meses (Marco Civil de Internet).",
        "Contadores de intentos de inicio de sesión: se borran hasta 1 día después del último intento.",
        "Copias de seguridad técnicas: [plazo a definir].",
      ],
    },
    {
      id: "derechos", title: "Sus derechos",
      body: ["Puede solicitar en cualquier momento (art. 18 de la LGPD):"],
      list: [
        "confirmación de que tratamos sus datos y acceso a ellos;",
        "corrección de datos incompletos, inexactos o desactualizados;",
        "anonimización, bloqueo o eliminación de datos innecesarios;",
        "portabilidad de los datos;",
        "información sobre con quién compartimos;",
        "revocación del consentimiento y eliminación de los datos tratados con base en él;",
        "revisión de decisiones tomadas solo por medios automatizados (la plataforma no toma decisiones automatizadas sobre atletas).",
      ],
    },
    {
      id: "como-ejercer", title: "Cómo ejercer sus derechos",
      list: [
        "En el área “Mi cuenta”, después de iniciar sesión: descargar una copia de sus datos y eliminar la cuenta.",
        "En el perfil del atleta: corregir datos, ocultar el perfil y bloquear organizaciones.",
        "Por correo a {email}, para las demás solicitudes. Respondemos en hasta 15 días.",
        "También puede presentar una reclamación ante la Autoridad Nacional de Protección de Datos de Brasil (ANPD) o ante la autoridad de su país.",
      ],
    },
    {
      id: "seguridad", title: "Seguridad",
      list: [
        "Conexión cifrada (HTTPS) en todo el sitio.",
        "Control de acceso en la propia base de datos: cada persona solo lee lo que puede ver.",
        "Segundo factor obligatorio para administradores.",
        "Fotos en almacenamiento privado, sin datos de ubicación.",
        "Límite de intentos de inicio de sesión y de códigos enviados por correo.",
        "Registro de las acciones administrativas.",
        "Ante un incidente de seguridad relevante, informaremos a la ANPD y a las personas afectadas (art. 48).",
      ],
    },
    {
      id: "cookies", title: "Cookies",
      body: [
        "Usamos solo cookies esenciales: sesión, segundo factor de administradores y reconocimiento del dispositivo (para no bloquear su cuenta cuando otra persona se equivoca de contraseña). No usamos cookies de publicidad ni de análisis de terceros.",
      ],
    },
    {
      id: "cambios", title: "Cambios en esta política",
      body: ["Avisaremos sobre cambios relevantes y, cuando la ley lo exija, pediremos un nuevo consentimiento. La versión vigente aparece al principio de esta página."],
    },
  ],
};

// ============================================================================ TERMOS
const termsPt: LegalDoc = {
  title: ["Termos", "de uso"],
  lead: "As regras para usar a VitrinePlayer com segurança — para famílias, atletas e profissionais.",
  sections: [
    {
      id: "sobre", title: "O que é a VitrinePlayer",
      body: [
        "Uma plataforma privada que apresenta perfis esportivos de atletas a profissionais verificados do futebol.",
        "A VitrinePlayer não é peneira, escolinha, rede social nem agência. O cadastro não garante teste, avaliação, contratação ou qualquer oportunidade.",
      ],
    },
    {
      id: "quem-pode-usar", title: "Quem pode usar",
      list: [
        "Responsáveis: pessoas maiores de 18 anos que sejam mãe, pai ou responsável legal do atleta que cadastram, ou o próprio atleta maior de idade.",
        "Atletas menores de idade: somente por meio da conta do responsável.",
        "Profissionais: pessoas ligadas a uma organização esportiva que passe pela verificação da equipe VitrinePlayer.",
      ],
    },
    {
      id: "conta", title: "Conta e segurança",
      list: [
        "Informe dados verdadeiros e mantenha-os atualizados.",
        "A senha é pessoal. Avise-nos imediatamente em caso de uso indevido da conta.",
        "Podemos limitar temporariamente tentativas de login, envio de códigos e cadastros para proteger as contas.",
        "Administradores usam segundo fator obrigatório.",
      ],
    },
    {
      id: "perfil", title: "Perfil do atleta",
      list: [
        "O responsável responde pela veracidade das informações e pela autorização de uso das fotos e vídeos enviados.",
        "Os perfis são revisados antes de ficarem visíveis. Podemos pedir correções, remover fotos ou vídeos e suspender perfis que descumpram estes termos.",
        "O responsável pode ocultar o perfil, bloquear organizações e excluir os dados a qualquer momento.",
      ],
    },
    {
      id: "profissionais", title: "Regras para profissionais",
      list: [
        "Use a plataforma apenas para avaliação esportiva legítima, em nome da organização verificada.",
        "Todo contato com atletas menores de idade passa pelo responsável, pela própria plataforma.",
        "É proibido copiar, exportar, divulgar ou revender perfis, fotos e vídeos.",
        "Notas, listas e avaliações são internas da sua organização e não substituem uma avaliação presencial.",
        "Respeite os limites de consulta e de interesses de cada período.",
        "A organização responde pelos membros que convidar para a equipe.",
      ],
    },
    {
      id: "interesses", title: "Interesses e contato",
      body: [
        "O profissional demonstra interesse pela plataforma. O responsável decide aceitar ou recusar e, ao aceitar, escolhe como seguir a conversa. Nenhum contato do atleta ou do responsável é exibido antes disso.",
      ],
    },
    {
      id: "proibido", title: "Condutas proibidas",
      list: [
        "Assédio, discriminação, ameaças ou qualquer conduta que coloque crianças e adolescentes em risco.",
        "Cobrar taxas para testes, avaliações ou “vagas”, ou fazer promessas de contratação.",
        "Publicar conteúdo impróprio, falso ou de terceiros sem autorização.",
        "Tentar burlar a segurança, usar robôs ou coletar dados em massa.",
      ],
    },
    {
      id: "denuncias", title: "Denúncias e moderação",
      body: [
        "Responsáveis podem denunciar um interesse ou uma organização pela plataforma. A equipe analisa as denúncias e pode cancelar interesses, suspender contas e comunicar autoridades quando houver risco a crianças e adolescentes.",
      ],
    },
    {
      id: "ia", title: "Análise técnica por IA",
      body: [
        "Recurso opcional, desligado nesta fase. Quando oferecido, depende do consentimento específico do responsável, tem caráter apenas indicativo e não gera decisões automatizadas sobre o atleta.",
      ],
    },
    {
      id: "gratuidade", title: "Gratuidade e planos",
      body: ["O acesso básico é gratuito nesta fase. Recursos pagos, se existirem no futuro, terão condições próprias, informadas antes de qualquer cobrança."],
    },
    {
      id: "encerramento", title: "Encerramento",
      body: ["Você pode excluir a sua conta a qualquer momento na área “Minha conta”. Podemos suspender ou encerrar contas que descumpram estes termos, informando o motivo sempre que possível."],
    },
    {
      id: "responsabilidade", title: "Responsabilidades",
      body: ["[Cláusula em elaboração jurídica: limites de responsabilidade, disponibilidade do serviço e conteúdo enviado por usuários, conforme o Código de Defesa do Consumidor.]"],
    },
    {
      id: "lei", title: "Lei aplicável e alterações",
      body: [
        "Aplicam-se as leis brasileiras, incluindo a LGPD, o Estatuto da Criança e do Adolescente e o Código de Defesa do Consumidor. Foro: {foro}.",
        "Avisaremos sobre mudanças relevantes nestes termos. A versão em vigor aparece no topo desta página.",
      ],
    },
  ],
};

const termsEs: LegalDoc = {
  title: ["Términos", "de uso"],
  lead: "Las reglas para usar VitrinePlayer con seguridad — para familias, atletas y profesionales.",
  sections: [
    {
      id: "sobre", title: "Qué es VitrinePlayer",
      body: [
        "Una plataforma privada que presenta perfiles deportivos de atletas a profesionales verificados del fútbol.",
        "VitrinePlayer no es una prueba de selección, escuela, red social ni agencia. El registro no garantiza pruebas, evaluaciones, contrataciones ni ninguna oportunidad.",
      ],
    },
    {
      id: "quien-puede-usar", title: "Quién puede usarla",
      list: [
        "Responsables: personas mayores de 18 años que sean madre, padre o tutor legal del atleta que registran, o el propio atleta mayor de edad.",
        "Atletas menores de edad: solo a través de la cuenta del responsable.",
        "Profesionales: personas vinculadas a una organización deportiva que pase la verificación del equipo de VitrinePlayer.",
      ],
    },
    {
      id: "cuenta", title: "Cuenta y seguridad",
      list: [
        "Proporcione datos verdaderos y manténgalos actualizados.",
        "La contraseña es personal. Avísenos de inmediato si hay uso indebido de la cuenta.",
        "Podemos limitar temporalmente los intentos de inicio de sesión, el envío de códigos y los registros para proteger las cuentas.",
        "Los administradores usan segundo factor obligatorio.",
      ],
    },
    {
      id: "perfil", title: "Perfil del atleta",
      list: [
        "El responsable responde por la veracidad de la información y por la autorización de uso de las fotos y videos enviados.",
        "Los perfiles se revisan antes de ser visibles. Podemos pedir correcciones, quitar fotos o videos y suspender perfiles que incumplan estos términos.",
        "El responsable puede ocultar el perfil, bloquear organizaciones y eliminar los datos en cualquier momento.",
      ],
    },
    {
      id: "profesionales", title: "Reglas para profesionales",
      list: [
        "Use la plataforma solo para evaluación deportiva legítima, en nombre de la organización verificada.",
        "Todo contacto con atletas menores de edad pasa por el responsable, a través de la propia plataforma.",
        "Está prohibido copiar, exportar, divulgar o revender perfiles, fotos y videos.",
        "Notas, listas y evaluaciones son internas de su organización y no sustituyen una evaluación presencial.",
        "Respete los límites de consulta y de intereses de cada período.",
        "La organización responde por los miembros que invite al equipo.",
      ],
    },
    {
      id: "intereses", title: "Intereses y contacto",
      body: [
        "El profesional muestra interés a través de la plataforma. El responsable decide aceptarlo o rechazarlo y, al aceptar, elige cómo seguir la conversación. Ningún contacto del atleta o del responsable se muestra antes de eso.",
      ],
    },
    {
      id: "prohibido", title: "Conductas prohibidas",
      list: [
        "Acoso, discriminación, amenazas o cualquier conducta que ponga en riesgo a niños, niñas y adolescentes.",
        "Cobrar tasas por pruebas, evaluaciones o “plazas”, o hacer promesas de contratación.",
        "Publicar contenido inapropiado, falso o de terceros sin autorización.",
        "Intentar eludir la seguridad, usar robots o recopilar datos de forma masiva.",
      ],
    },
    {
      id: "denuncias", title: "Denuncias y moderación",
      body: [
        "Los responsables pueden denunciar un interés o una organización desde la plataforma. El equipo analiza las denuncias y puede cancelar intereses, suspender cuentas e informar a las autoridades cuando haya riesgo para menores.",
      ],
    },
    {
      id: "ia", title: "Análisis técnico por IA",
      body: [
        "Recurso opcional, desactivado en esta fase. Cuando se ofrezca, dependerá del consentimiento específico del responsable, será solo indicativo y no generará decisiones automatizadas sobre el atleta.",
      ],
    },
    {
      id: "gratuidad", title: "Gratuidad y planes",
      body: ["El acceso básico es gratuito en esta fase. Los recursos de pago, si existen en el futuro, tendrán condiciones propias, informadas antes de cualquier cobro."],
    },
    {
      id: "cierre", title: "Cierre de la cuenta",
      body: ["Puede eliminar su cuenta en cualquier momento en el área “Mi cuenta”. Podemos suspender o cerrar cuentas que incumplan estos términos, informando el motivo siempre que sea posible."],
    },
    {
      id: "responsabilidad", title: "Responsabilidades",
      body: ["[Cláusula en elaboración jurídica: límites de responsabilidad, disponibilidad del servicio y contenido enviado por usuarios, conforme al Código de Defensa del Consumidor de Brasil.]"],
    },
    {
      id: "ley", title: "Ley aplicable y cambios",
      body: [
        "Se aplican las leyes brasileñas, incluidas la LGPD, el Estatuto del Niño y del Adolescente y el Código de Defensa del Consumidor. Jurisdicción: {foro}.",
        "Avisaremos sobre cambios relevantes en estos términos. La versión vigente aparece al principio de esta página.",
      ],
    },
  ],
};

// ============================================================================ CONTATO
const contactPt: LegalDoc = {
  title: ["Fale", "conosco"],
  lead: "Dúvidas, pedidos sobre os seus dados ou denúncias: escolha o caminho mais rápido.",
  sections: [
    {
      id: "geral", title: "Atendimento",
      body: ["E-mail: {email}. Respondemos em dias úteis."],
    },
    {
      id: "dados", title: "Privacidade e dados pessoais",
      list: [
        "Baixar seus dados ou excluir a conta: na área “Minha conta”, depois de entrar.",
        "Corrigir dados, ocultar o perfil ou bloquear uma organização: no perfil do atleta.",
        "Outros pedidos (art. 18 da LGPD): encarregado {encarregado}, pelo e-mail {email}. Prazo de resposta: até 15 dias.",
      ],
    },
    {
      id: "denuncias", title: "Denúncias",
      list: [
        "Interesse ou organização suspeita: use “Denunciar” no interesse recebido, na área do responsável.",
        "Outros casos: escreva para {email}, com o máximo de detalhes possível.",
        "Risco imediato a uma criança ou adolescente: ligue 190 (polícia) ou Disque 100 (direitos humanos).",
      ],
    },
    {
      id: "profissionais", title: "Organizações e profissionais",
      body: ["Para verificação de organizações e dúvidas sobre o portal profissional: {email}."],
    },
  ],
};

const contactEs: LegalDoc = {
  title: ["Hable", "con nosotros"],
  lead: "Dudas, solicitudes sobre sus datos o denuncias: elija el camino más rápido.",
  sections: [
    {
      id: "general", title: "Atención",
      body: ["Correo: {email}. Respondemos en días hábiles."],
    },
    {
      id: "datos", title: "Privacidad y datos personales",
      list: [
        "Descargar sus datos o eliminar la cuenta: en el área “Mi cuenta”, después de iniciar sesión.",
        "Corregir datos, ocultar el perfil o bloquear una organización: en el perfil del atleta.",
        "Otras solicitudes (art. 18 de la LGPD): encargado {encarregado}, por correo a {email}. Plazo de respuesta: hasta 15 días.",
      ],
    },
    {
      id: "denuncias", title: "Denuncias",
      list: [
        "Interés u organización sospechosa: use “Denunciar” en el interés recibido, en el área del responsable.",
        "Otros casos: escriba a {email}, con el mayor detalle posible.",
        "Riesgo inmediato para un niño, niña o adolescente: llame a los servicios de emergencia de su país.",
      ],
    },
    {
      id: "profesionales", title: "Organizaciones y profesionales",
      body: ["Para la verificación de organizaciones y dudas sobre el portal profesional: {email}."],
    },
  ],
};

export const legalDocs = {
  privacy: { pt: privacyPt, es: privacyEs },
  terms: { pt: termsPt, es: termsEs },
  contact: { pt: contactPt, es: contactEs },
} satisfies Record<string, Record<Locale, LegalDoc>>;
export type LegalKind = keyof typeof legalDocs;
