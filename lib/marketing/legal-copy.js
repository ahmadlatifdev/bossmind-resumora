/** Legal / policy page copy (EN/FR) — Google-friendly structure */

export function refundCopy(lang) {
  return lang === "fr"
    ? {
        title: "Politique de remboursement",
        meta: "Politique de remboursement Resumora — travail non livré.",
        sections: [
          {
            h: "Portée",
            p: "Les paiements sont traités de façon sécurisée via Stripe. La présente politique encadre les demandes de remboursement pour les services Resumora (resumora.net).",
          },
          {
            h: "Éligibilité au remboursement",
            p: "Un remboursement peut être accordé lorsque le travail commandé n’a pas été complété ou livré selon les modalités convenues au moment de la commande, sous réserve de vérification.",
          },
          {
            h: "Après livraison ou achèvement",
            p: "Une fois les livrables fournis ou le travail marqué comme complété dans notre flux de production, les remboursements ne sont généralement plus disponibles, sauf obligation légale ou accord écrit distinct.",
          },
          {
            h: "Demande",
            p: "Adressez votre demande à support@resumora.net avec l’e-mail du compte et l’identifiant de commande Stripe ou la référence de session. Réponse sous 2 jours ouvrés en règle générale.",
          },
        ],
      }
    : {
        title: "Refund Policy",
        meta: "Resumora refund policy — work not yet completed or delivered.",
        sections: [
          {
            h: "Scope",
            p: "Payments are processed securely through Stripe. This policy governs refund requests for Resumora services purchased via resumora.net.",
          },
          {
            h: "Eligibility",
            p: "A refund may be issued when commissioned work has not been completed or delivered according to the terms agreed at checkout, subject to verification.",
          },
          {
            h: "After delivery or completion",
            p: "Once deliverables are supplied or work is marked complete in our production workflow, refunds are generally not available except where required by law or by separate written agreement.",
          },
          {
            h: "How to request",
            p: "Email support@resumora.net from your account email with your Stripe receipt or checkout session reference. We typically respond within two business days.",
          },
        ],
      };
}

export function systemPolicyCopy(lang) {
  return lang === "fr"
    ? {
        title: "Politique système et plateforme",
        meta: "Politique plateforme Resumora — usage acceptable, sécurité et conformité.",
        sections: [
          {
            h: "Usage acceptable",
            p: "La plateforme est destinée à la commande et à la livraison de services de carrière professionnels. Toute utilisation abusive, tentative d’accès non autorisé ou contournement des contrôles est interdite.",
          },
          {
            h: "Disponibilité",
            p: "Nous visons une haute disponibilité ; des interruptions planifiées ou d’urgence peuvent survenir. Les créneaux de maintenance sont annoncés lorsque possible.",
          },
          {
            h: "Données et sécurité",
            p: "Les documents sont traités selon nos pratiques de sécurité et notre Politique de confidentialité. Ne téléversez pas d’informations dont vous n’avez pas le droit de partager.",
          },
          {
            h: "Conformité et annonces",
            p: "Les descriptions de service reflètent les livrables réels. Les politiques sont structurées pour une indexation claire par les moteurs de recherche et une lecture transparente pour les utilisateurs.",
          },
        ],
      }
    : {
        title: "System & Platform Policy",
        meta: "Resumora platform policy — acceptable use, security, and compliance.",
        sections: [
          {
            h: "Acceptable use",
            p: "The platform is intended for ordering and delivering professional career services. Abuse, unauthorized access attempts, or circumvention of controls is prohibited.",
          },
          {
            h: "Availability",
            p: "We target high availability; planned or emergency maintenance may occur. Maintenance windows are communicated when practicable.",
          },
          {
            h: "Data & security",
            p: "Materials are handled according to our security practices and Privacy Policy. Do not upload information you are not entitled to share.",
          },
          {
            h: "Compliance & transparency",
            p: "Service descriptions reflect actual deliverables. Policies are structured for clear search indexing and straightforward user review.",
          },
        ],
      };
}

export function chatPageCopy(lang) {
  return lang === "fr"
    ? {
        title: "Chat & réponses automatisées",
        meta: "Contact Resumora — accusé de réception automatisé 24h/24.",
        lead:
          "Soumettez un message ci-dessous. Un accusé de réception automatisé confirme la réception immédiate ; une réponse humaine suit selon la charge et votre palier.",
        automated: "Réponse automatisée 24h/24 : confirmation de réception à chaque envoi réussi.",
        formEmail: "E-mail",
        formMessage: "Message",
        formSubmit: "Envoyer",
        formThanks: "Message reçu. Vérifiez votre boîte pour la confirmation.",
      }
    : {
        title: "Live chat & automated responses",
        meta: "Contact Resumora — 24/7 automated acknowledgment.",
        lead:
          "Submit a message below. An automated acknowledgment confirms receipt immediately; a human reply follows based on queue and your plan tier.",
        automated: "24/7 automated acknowledgment on every successful submission.",
        formEmail: "Email",
        formMessage: "Message",
        formSubmit: "Send",
        formThanks: "Message received. Check your inbox for confirmation.",
      };
}
