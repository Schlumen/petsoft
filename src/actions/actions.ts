"use server";

import { signIn, signOut } from "@/lib/auth";
import prisma from "@/lib/db";
import { authSchema, petFormSchema, petIdSchema } from "@/lib/validations";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { checkAuth, getPetById } from "@/lib/server-utils";
import { Prisma } from "@prisma/client";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// --- USER ACTIONS ---

export async function logIn(prevState: unknown, formData: unknown) {
  // Check if formData is a FormData type
  if (!(formData instanceof FormData)) {
    return {
      message: "Invalid form data",
    };
  }

  try {
    await signIn("credentials", formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin": {
          return {
            message: "Invalid credentials",
          };
        }
        default: {
          return {
            message: "Could not sign in",
          };
        }
      }
    }

    // re-throw error if it's not an AuthError (next.js redirect throws an error)
    throw error;
  }
}

export async function logOut() {
  await signOut({ redirectTo: "/" });
}

export async function signUp(prevState: unknown, formData: unknown) {
  // Check if formData is a FormData type
  if (!(formData instanceof FormData)) {
    return {
      message: "Invalid form data",
    };
  }

  // convert FormData to object
  const formDataEntries = Object.fromEntries(formData.entries());

  // validation
  const validatedFormData = authSchema.safeParse(formDataEntries);
  if (!validatedFormData.success) {
    return {
      message: "Invalid form data",
    };
  }

  const { email, password } = validatedFormData.data;
  const hashedPassword = await bcrypt.hash(password, 10);
  try {
    await prisma.user.create({
      data: {
        email,
        hashedPassword,
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return {
          message: "Email already exists",
        };
      }
    }
    return {
      message: "Could not create user",
    };
  }

  await signIn("credentials", formData);
}

// --- PET ACTIONS ---

export async function addPet(pet: unknown) {
  const session = await checkAuth();

  const validatedPet = petFormSchema.safeParse(pet);
  if (!validatedPet.success) {
    return {
      message: "Invalid pet data",
    };
  }

  try {
    await prisma.pet.create({
      data: {
        ...validatedPet.data,
        user: {
          connect: {
            id: session.user.id,
          },
        },
      },
    });
  } catch (error) {
    return {
      message: "Could not add pet",
    };
  }
  revalidatePath("/app", "layout");
}

export async function editPet(petId: unknown, newPetData: unknown) {
  // authentication check
  const session = await checkAuth();

  // validation
  const validatedId = petIdSchema.safeParse(petId);
  const validatedPet = petFormSchema.safeParse(newPetData);
  if (!validatedPet.success || !validatedId.success) {
    return {
      message: "Invalid pet data",
    };
  }

  // authorization check (user owns pet)
  const pet = await getPetById(validatedId.data);

  if (!pet) {
    return {
      message: "Pet not found",
    };
  }

  if (pet.userId !== session.user.id) {
    return {
      message: "Unauthorized",
    };
  }

  // database mutation
  try {
    await prisma.pet.update({
      where: {
        id: validatedId.data,
      },
      data: validatedPet.data,
    });
  } catch (error) {
    return {
      message: "Could not edit pet",
    };
  }
  revalidatePath("/app", "layout");
}

export async function deletePet(petId: unknown) {
  // authentication check
  const session = await checkAuth();

  // validation
  const validatedId = petIdSchema.safeParse(petId);
  if (!validatedId.success) {
    return {
      message: "Invalid pet id",
    };
  }

  // authorization check (user owns pet)
  const pet = await getPetById(validatedId.data);

  if (!pet) {
    return {
      message: "Pet not found",
    };
  }

  if (pet.userId !== session.user.id) {
    return {
      message: "Unauthorized",
    };
  }

  // database mutation
  try {
    await prisma.pet.delete({
      where: {
        id: validatedId.data,
      },
    });
  } catch (error) {
    return {
      message: "Could not delete pet",
    };
  }
  revalidatePath("/app", "layout");
}

// --- PAYMENT ACTIONS ---

export async function createCheckoutSession() {
  // authentication check
  const session = await checkAuth();

  // create checkout session
  const checkoutSession = await stripe.checkout.sessions.create({
    customer_email: session.user.email!,
    line_items: [
      {
        price: "price_1QASNKDL8mvBcd21I1eG4SbN",
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${process.env.CANONICAL_URL}/payment?success=true`,
    cancel_url: `${process.env.CANONICAL_URL}/payment?canceled=true`,
  });

  // redirect to payment page
  redirect(checkoutSession.url!);
}
